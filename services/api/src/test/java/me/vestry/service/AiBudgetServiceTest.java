package me.vestry.service;

import me.vestry.config.AiConfig.AiLimits;
import me.vestry.model.AiBudget;
import me.vestry.model.AiGeneration;
import me.vestry.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest(showSql = false)
@ActiveProfiles("test")
@Import({AiBudgetService.class, AiBudgetServiceTest.Config.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class AiBudgetServiceTest {
    @Autowired AiBudgetService service;
    @Autowired AiBudgetRepository budget;
    @Autowired AiGenerationRepository jobs;
    @Autowired AiCallRepository calls;
    @Autowired MutableClock clock;

    @TestConfiguration
    static class Config {
        @Bean AiLimits limits() { return new AiLimits(true, 30_000, 20_000, 5); }
        @Bean MutableClock clock() { return new MutableClock(); }
    }
    static class MutableClock extends Clock {
        final AtomicReference<Instant> now = new AtomicReference<>();
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return Clock.fixed(instant(), zone); }
        public Instant instant() { return now.get(); }
    }
    private static String key(int n) { return String.format("%064x", n); }

    @BeforeEach
    void reset() {
        calls.deleteAll(); jobs.deleteAll(); budget.deleteAll();
        budget.saveAndFlush(new AiBudget());
        clock.now.set(Instant.parse("2026-10-02T03:59:00Z")); // Still October 1 in New York.
    }

    @Test
    void reservesBeforeWorkAndDeduplicatesAcrossServiceCalls() {
        var start = service.start(key(1), 10_000);
        assertEquals(10_000, jobs.totalCharged());
        assertEquals(LocalDate.of(2026, 10, 1), jobs.findById(start.id()).orElseThrow().getBudgetDay());
        var duplicate = service.start(key(1), 10_000);
        assertFalse(duplicate.created());
        assertEquals(start.id(), duplicate.id());
        var call = service.reserveCall(start.id(), "summary", 4_000);
        assertThrows(IllegalStateException.class, () -> service.reserveCall(start.id(), "other", 1_000));
        service.settleCall(call, 900);
        service.settleCall(call, 0); // Settlement cannot be replayed to refund another time.
        assertThrows(IllegalStateException.class, () -> service.reserveCall(start.id(), "summary", 4_000));
        service.finish(start.id(), true);
        assertEquals(900, jobs.totalCharged());
        assertEquals(AiGeneration.Status.SUCCEEDED, jobs.findById(start.id()).orElseThrow().getStatus());
        assertFalse(service.start(key(1), 10_000).created());
    }

    @Test
    void uncertainCallKeepsItsReservationAndCannotResume() {
        var job = service.start(key(1), 10_000);
        service.reserveCall(job.id(), "summary", 4_000);
        service.finish(job.id(), false);
        assertEquals(4_000, jobs.totalCharged());
        assertEquals(AiGeneration.Status.UNKNOWN, jobs.findById(job.id()).orElseThrow().getStatus());
        assertThrows(IllegalStateException.class, () -> service.reserveCall(job.id(), "retry", 4_000));
    }

    @Test
    void abandonedJobKeepsFullAllowanceAcrossMidnightAndIsNeverReplayed() {
        var abandoned = service.start(key(1), 15_000);
        service.reserveCall(abandoned.id(), "summary", 4_000);
        clock.now.set(clock.instant().plus(Duration.ofMinutes(6)));
        assertFalse(service.start(key(1), 15_000).created());
        assertEquals(AiGeneration.Status.UNKNOWN, jobs.findById(abandoned.id()).orElseThrow().getStatus());
        assertThrows(IllegalStateException.class, () -> service.reserveCall(abandoned.id(), "retry", 1_000));
        assertThrows(IllegalStateException.class, () -> service.start(key(2), 15_001));
        var next = service.start(key(2), 15_000);
        assertTrue(next.created());
        assertEquals(30_000, jobs.totalCharged());
        service.finish(abandoned.id(), false); // A late worker must not release a crashed job's allowance.
        assertEquals(30_000, jobs.totalCharged());
    }

    @Test
    void enforcesDailyMoneyAndJobAllowance() {
        var first = service.start(key(1), 15_000);
        assertThrows(IllegalStateException.class, () -> service.reserveCall(first.id(), "oversized", 15_001));
        var call = service.reserveCall(first.id(), "summary", 15_000);
        service.settleCall(call, 15_000);
        service.finish(first.id(), true);
        assertThrows(IllegalStateException.class, () -> service.start(key(2), 5_001));
        assertTrue(service.start(key(2), 5_000).created());
    }

    @Test
    void failuresStillConsumeDailyGenerationSlots() {
        for (int i = 1; i <= 5; i++) {
            var job = service.start(key(i), 1_000);
            service.finish(job.id(), false);
        }
        assertEquals(0, jobs.totalCharged());
        assertThrows(IllegalStateException.class, () -> service.start(key(6), 1_000));
    }

    @Test
    void databaseLockPreventsConcurrentStarts() throws Exception {
        var gate = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            Callable<Boolean> first = () -> { gate.await(); return attempt(1); };
            Callable<Boolean> second = () -> { gate.await(); return attempt(2); };
            var a = executor.submit(first);
            var b = executor.submit(second);
            gate.countDown();
            assertNotEquals(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS));
            assertEquals(1, jobs.count());
            assertEquals(15_000, jobs.totalCharged());
        } finally { executor.shutdownNow(); }
    }

    private boolean attempt(int n) {
        try { return service.start(key(n), 15_000).created(); }
        catch (IllegalStateException limit) { return false; }
    }

    @Test
    void unexpectedOverrunPersistsUsageAndStopsFutureSpending() {
        var job = service.start(key(1), 10_000);
        var call = service.reserveCall(job.id(), "summary", 4_000);
        service.settleCall(call, 4_001);
        assertThrows(IllegalStateException.class, () -> service.reserveCall(job.id(), "other", 1_000));
        service.finish(job.id(), false);
        assertEquals(4_001, jobs.totalCharged());
        assertThrows(IllegalStateException.class, () -> service.start(key(2), 1_000));
    }

    @Test
    void missingBudgetRowFailsClosed() {
        budget.deleteAll();
        assertThrows(IllegalStateException.class, () -> service.start(key(1), 1_000));
        assertEquals(0, jobs.count());
    }
}
