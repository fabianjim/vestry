package me.vestry.service;

import lombok.RequiredArgsConstructor;
import me.vestry.config.AiConfig.AiLimits;
import me.vestry.model.AiBudget;
import me.vestry.model.AiCall;
import me.vestry.model.AiGeneration;
import me.vestry.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.time.Duration;
import java.time.ZoneId;
import java.util.UUID;

@Service
@Transactional(propagation = Propagation.REQUIRES_NEW)
@RequiredArgsConstructor
public class AiBudgetService {
    public static final Duration MAX_JOB_TIME = Duration.ofMinutes(5);
    private static final ZoneId BUDGET_ZONE = ZoneId.of("America/New_York");
    private final AiBudgetRepository budget;
    private final AiGenerationRepository jobs;
    private final AiCallRepository calls;
    private final AiLimits limits;
    private final Clock clock;

    public record Start(UUID id, boolean created) {}

    /** Read-only availability hint; start() still enforces exact costs under the database lock. */
    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public boolean canStart() {
        if (!limits.enabled() || budget.findById(1).map(AiBudget::isBlocked).orElse(true)) return false;
        var now = clock.instant();
        var day = now.atZone(BUDGET_ZONE).toLocalDate();
        return jobs.countByBudgetDay(day) < limits.dailyGenerations()
                && limits.permitsLifetimeSpend(jobs.totalCharged(), 1) && jobs.chargedOn(day) < limits.dailyMicros()
                && jobs.findByStatus(AiGeneration.Status.RUNNING).stream()
                    .noneMatch(job -> job.getStartedAt().plus(MAX_JOB_TIME).isAfter(now));
    }

    public Start start(String key, long allowance) {
        if (!limits.enabled()) throw new IllegalStateException("AI is disabled");
        if (key == null || !key.matches("[a-f0-9]{64}") || allowance <= 0) {
            throw new IllegalArgumentException("Invalid AI generation reservation");
        }
        lockAvailable();
        var now = clock.instant();
        // A crashed worker is never replayed. Keep its full reservation, even after midnight.
        for (var running : jobs.findByStatus(AiGeneration.Status.RUNNING)) {
            if (!running.getStartedAt().plus(MAX_JOB_TIME).isAfter(now)) {
                running.finish(AiGeneration.Status.UNKNOWN, running.getChargedMicros());
            }
        }
        var existing = jobs.findByRequestKey(key);
        if (existing.isPresent()) return new Start(existing.get().getId(), false);
        if (!jobs.findByStatus(AiGeneration.Status.RUNNING).isEmpty()) {
            throw new IllegalStateException("An AI generation is already running");
        }
        var day = now.atZone(BUDGET_ZONE).toLocalDate();
        if (jobs.countByBudgetDay(day) >= limits.dailyGenerations()
                || !limits.permitsLifetimeSpend(jobs.totalCharged(), allowance)
                || allowance > limits.dailyMicros() - jobs.chargedOn(day)) {
            throw new IllegalStateException("AI allowance reached");
        }
        var job = jobs.saveAndFlush(new AiGeneration(key, now, day, allowance));
        return new Start(job.getId(), true);
    }

    public UUID reserveCall(UUID jobId, String step, long allowance) {
        if (!limits.enabled()) throw new IllegalStateException("AI is disabled");
        if (step == null || !step.matches("[a-zA-Z0-9._-]{1,80}") || allowance <= 0) {
            throw new IllegalArgumentException("Invalid AI call reservation");
        }
        lockAvailable();
        var job = jobs.findById(jobId).orElseThrow();
        if (job.getStatus() != AiGeneration.Status.RUNNING
                || !job.getStartedAt().plus(MAX_JOB_TIME).isAfter(clock.instant())) {
            throw new IllegalStateException("AI generation is no longer active");
        }
        var previous = calls.findByGenerationId(jobId);
        if (previous.stream().anyMatch(call -> call.getStep().equals(step) || !call.isSettled())) {
            throw new IllegalStateException("AI call already attempted or unresolved");
        }
        long used = previous.stream().mapToLong(AiCall::getChargedMicros).sum();
        if (allowance > job.getReservedMicros() - used) throw new IllegalStateException("AI generation allowance reached");
        return calls.saveAndFlush(new AiCall(jobId, step, allowance)).getId();
    }

    public void settleCall(UUID id, long actualMicros) {
        var account = lock();
        var call = calls.findById(id).orElseThrow();
        if (call.isSettled()) return;
        if (actualMicros < 0) throw new IllegalArgumentException("Invalid AI usage");
        call.settle(actualMicros);
        // Persist the stop separately from the caller's exception if our cost bound was wrong.
        if (actualMicros > call.getReservedMicros()) account.block();
    }

    public void finish(UUID id, boolean success) {
        lock();
        var job = jobs.findById(id).orElseThrow();
        if (job.getStatus() != AiGeneration.Status.RUNNING) return;
        var attempted = calls.findByGenerationId(id);
        boolean unresolved = attempted.stream().anyMatch(call -> !call.isSettled());
        job.finish(unresolved ? AiGeneration.Status.UNKNOWN
                        : success ? AiGeneration.Status.SUCCEEDED : AiGeneration.Status.FAILED,
                attempted.stream().mapToLong(AiCall::getChargedMicros).sum());
    }

    private void lockAvailable() {
        if (lock().isBlocked()) throw new IllegalStateException("AI budget requires review");
    }

    private AiBudget lock() {
        return budget.lockBudget().orElseThrow(() -> new IllegalStateException("AI budget is not initialized"));
    }
}
