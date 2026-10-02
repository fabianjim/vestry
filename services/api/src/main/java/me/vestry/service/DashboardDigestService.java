package me.vestry.service;

import me.vestry.model.AiGeneration;
import me.vestry.model.DemoSession;
import me.vestry.model.User;
import me.vestry.repository.AiGenerationRepository;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HexFormat;

@Service
public class DashboardDigestService {
    private static final ZoneId ZONE = ZoneId.of("America/New_York");
    private final DigestService digests;
    private final DigestContextService context;
    private final AiGenerationService generations;
    private final AiGenerationRepository jobs;
    private final AiBudgetService budget;
    private final DashboardLayoutService layouts;
    private final DemoSessionResolver users;
    private final Clock clock;

    public DashboardDigestService(DigestService digests, DigestContextService context, AiGenerationService generations,
                                  AiGenerationRepository jobs, AiBudgetService budget, DashboardLayoutService layouts,
                                  DemoSessionResolver users, Clock aiClock) {
        this.digests = digests;
        this.context = context;
        this.generations = generations;
        this.jobs = jobs;
        this.budget = budget;
        this.layouts = layouts;
        this.users = users;
        clock = aiClock;
    }

    public enum Status { DISABLED, HIDDEN, IDLE, GENERATING, READY, FAILED, LIMITED }
    public record State(Status status, LocalDate day, DigestService.Result digest) {}

    public boolean available() { return digests.available(); }

    public State get(DemoSession demo) {
        return state(users.getCurrentUser(), demo, today());
    }

    public State generate(DemoSession demo) {
        var user = users.getCurrentUser();
        var day = today();
        var before = state(user, demo, day);
        if (user.isDemo() || before.status() != Status.IDLE) return before;
        try {
            var snapshot = context.capture();
            generations.submit(key(user, day), digests.allowance(snapshot), id -> digests.generate(id, snapshot));
        } catch (IllegalStateException unavailable) {
            // Expose no provider details or private context. Accepted/duplicate jobs remain discoverable by GET.
            var after = state(user, demo, day);
            return after.status() == Status.IDLE ? new State(Status.LIMITED, day, before.digest()) : after;
        }
        return state(user, demo, day);
    }

    /** Scheduler entry point: no authenticated principal or visitor layout is required. */
    public void generateDemo(User user) {
        if (!user.isDemo()) throw new IllegalArgumentException("Scheduled briefings are demo-only");
        if (!available() || !budget.canStart()) return;
        String requestKey = key(user, today());
        if (jobs.findByRequestKey(requestKey).isPresent()) return;
        var snapshot = context.captureDemo(user);
        generations.submit(requestKey, digests.allowance(snapshot), id -> digests.generate(id, snapshot));
    }

    private State state(User user, DemoSession demo, LocalDate day) {
        if (!available()) return new State(Status.DISABLED, day, null);
        if (!layouts.get(user, demo).path("showBriefing").asBoolean()) return new State(Status.HIDDEN, day, null);
        var latest = digests.latest().orElse(null);
        var job = jobs.findByRequestKey(key(user, day));
        if (job.isPresent()) {
            var current = job.get();
            if (current.getStatus() == AiGeneration.Status.RUNNING
                    && current.getStartedAt().plus(AiBudgetService.MAX_JOB_TIME).isAfter(clock.instant())) {
                return new State(Status.GENERATING, day, latest);
            }
            if (latest != null && latest.id().equals(current.getId())) return new State(Status.READY, day, latest);
            return new State(Status.FAILED, day, latest);
        }
        if (latest != null && latest.capturedAt().atZone(ZONE).toLocalDate().equals(day)) {
            return new State(Status.READY, day, latest);
        }
        return new State(budget.canStart() ? Status.IDLE : Status.LIMITED, day, latest);
    }

    private LocalDate today() { return clock.instant().atZone(ZONE).toLocalDate(); }

    private static String key(User user, LocalDate day) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(("digest-v1:" + user.getId() + ":" + day).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
}
