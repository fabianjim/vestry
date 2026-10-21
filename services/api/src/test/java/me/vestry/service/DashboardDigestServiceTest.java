package me.vestry.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import me.vestry.model.AiGeneration;
import me.vestry.model.DemoSession;
import me.vestry.model.User;
import me.vestry.repository.AiGenerationRepository;
import me.vestry.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.*;
import java.util.*;
import java.util.function.Consumer;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class DashboardDigestServiceTest {
    private final DigestService digests = mock(DigestService.class);
    private final DigestContextService context = mock(DigestContextService.class);
    private final AiGenerationService generations = mock(AiGenerationService.class);
    private final AiGenerationRepository jobs = mock(AiGenerationRepository.class);
    private final AiBudgetService budget = mock(AiBudgetService.class);
    private final DashboardLayoutService layouts = mock(DashboardLayoutService.class);
    private final DemoSessionResolver users = mock(DemoSessionResolver.class);
    private final UserRepository accounts = mock(UserRepository.class);
    private final Instant now = Instant.parse("2026-10-02T03:00:00Z");
    private final Clock clock = Clock.fixed(now, ZoneOffset.UTC);
    private final DashboardDigestService service = new DashboardDigestService(digests, context, generations, jobs, budget, layouts, users, clock, accounts);
    private final User user = new User();
    private final Map<String, AiGeneration> stored = new HashMap<>();
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setup() {
        user.setId(7);
        when(users.getCurrentUser()).thenReturn(user);
        when(digests.available()).thenReturn(true);
        when(budget.canStart()).thenReturn(true);
        when(budget.canStart(anyList())).thenReturn(true);
        when(layouts.get(eq(user), any())).thenReturn(mapper.createObjectNode().put("showBriefing", true));
        when(jobs.findByRequestKey(anyString())).thenAnswer(i -> Optional.ofNullable(stored.get(i.getArgument(0))));
        when(context.capture()).thenReturn(new DigestContextService.Snapshot(7, false, now, List.of(), "{}"));
        when(digests.allowance(any())).thenReturn(30000L);
        when(generations.submit(anyString(), eq(30000L), any())).thenAnswer(i -> run(i.getArgument(0), i.getArgument(2)));
        when(generations.submit(anyString(), eq(30000L), anyList(), any()))
                .thenAnswer(i -> run(i.getArgument(0), i.getArgument(3)));
    }

    private UUID run(String key, Consumer<UUID> work) {
        var job = new AiGeneration(key, now, LocalDate.of(2026, 10, 1), 30000);
        stored.put(key, job);
        work.accept(job.getId());
        return job.getId();
    }

    @Test
    void readingPrivateStatusDoesNotCaptureOrGenerateAndPostDeduplicatesTheDailyJob() {
        assertEquals(DashboardDigestService.Status.IDLE, service.get(null).status());
        verifyNoInteractions(context, generations);
        assertEquals(DashboardDigestService.Status.GENERATING, service.generate(null).status());
        assertEquals(DashboardDigestService.Status.GENERATING, service.generate(null).status());
        verify(context, times(1)).capture();
        verify(generations, times(1)).submit(anyString(), anyLong(), anyList(), any());
        verify(digests).generate(any(), any());
        assertEquals(LocalDate.of(2026, 10, 1), service.get(null).day());
    }

    @Test
    void demoVisitorsCannotTriggerGenerationAndScheduleSharesOneDailyKey() {
        user.setDemo(true);
        when(context.captureDemo(user)).thenReturn(new DigestContextService.Snapshot(7, true, now, List.of(), "{}"));
        service.generate(new DemoSession()); service.generate(new DemoSession());
        verifyNoInteractions(context, generations);
        service.generateDemo(user); service.generateDemo(user);
        assertEquals(1, stored.size());
        verify(context, times(1)).captureDemo(user);
        verify(context, never()).capture();
        user.setDemo(false);
        user.setId(8);
        assertThrows(IllegalArgumentException.class, () -> service.generateDemo(user));
        service.generate(null);
        assertEquals(2, stored.size());
    }

    @Test
    void scheduledDemoIgnoresVisitorVisibilityAndRetainsPreviousResultBeforeRefresh() {
        user.setDemo(true);
        var previous = new DigestService.Result(UUID.randomUUID(), now.minusSeconds(86400), now.minusSeconds(86400), null);
        when(digests.latest()).thenReturn(Optional.of(previous));
        assertEquals(previous, service.get(new DemoSession()).digest());
        when(context.captureDemo(user)).thenReturn(new DigestContextService.Snapshot(7, true, now, List.of(), "{}"));
        clearInvocations(layouts, users);
        service.generateDemo(user);
        verifyNoInteractions(layouts, users);
        assertEquals(previous, service.get(new DemoSession()).digest());
    }

    @Test
    void hiddenDisabledAndExhaustedStatesNeverReadContextOrSubmit() {
        when(digests.available()).thenReturn(false);
        assertEquals(DashboardDigestService.Status.DISABLED, service.generate(null).status());
        verifyNoInteractions(layouts, jobs, context, generations);
        when(digests.available()).thenReturn(true);
        when(layouts.get(user, null)).thenReturn(mapper.createObjectNode().put("showBriefing", false));
        assertEquals(DashboardDigestService.Status.HIDDEN, service.generate(null).status());
        verifyNoInteractions(jobs, context, generations);
        when(layouts.get(user, null)).thenReturn(mapper.createObjectNode().put("showBriefing", true));
        when(budget.canStart(anyList())).thenReturn(false);
        assertEquals(DashboardDigestService.Status.LIMITED, service.generate(null).status());
        verifyNoInteractions(context, generations);
    }

    @Test
    void successfulAndFailedJobsAreNotReplayedAndOldResultsRemainReadable() {
        service.generate(null);
        var job = stored.values().iterator().next();
        job.finish(AiGeneration.Status.SUCCEEDED, 1000);
        var result = new DigestService.Result(job.getId(), now, now, null);
        when(digests.latest()).thenReturn(Optional.of(result));
        assertEquals(DashboardDigestService.Status.READY, service.generate(null).status());
        when(digests.latest()).thenReturn(Optional.of(new DigestService.Result(UUID.randomUUID(), now.minusSeconds(86400), now.minusSeconds(86400), null)));
        job.finish(AiGeneration.Status.UNKNOWN, 30000);
        var failed = service.generate(null);
        assertEquals(DashboardDigestService.Status.FAILED, failed.status());
        assertNotNull(failed.digest());
        verify(context, times(1)).capture();
    }

    @Test
    void newYorkDayChangeAllowsNewRequestAndExpiredJobsStopPolling() {
        service.generate(null);
        var later = new DashboardDigestService(digests, context, generations, jobs, budget, layouts, users,
                Clock.fixed(now.plusSeconds(301), ZoneOffset.UTC), accounts);
        assertEquals(DashboardDigestService.Status.FAILED, later.get(null).status());
        later = new DashboardDigestService(digests, context, generations, jobs, budget, layouts, users,
                Clock.fixed(Instant.parse("2026-10-02T04:00:00Z"), ZoneOffset.UTC), accounts);
        assertEquals(DashboardDigestService.Status.IDLE, later.get(null).status());
    }

    @Test
    void rejectedReservationReturnsLimitedWithoutLeakingErrorText() {
        when(generations.submit(anyString(), anyLong(), anyList(), any())).thenThrow(new IllegalStateException("provider details"));
        assertEquals(DashboardDigestService.Status.LIMITED, service.generate(null).status());
        verify(digests, never()).generate(any(), any());
    }

    @Test
    void weekdayUserBriefingsReserveTheDemoSlotButWeekendsAndTheDemoDoNot() {
        var demo = new User(); demo.setId(3); demo.setDemo(true);
        when(accounts.findByDemoTrue()).thenReturn(List.of(demo));
        when(context.captureDemo(demo)).thenReturn(new DigestContextService.Snapshot(3, true, now, List.of(), "{}"));

        service.generate(null); // Thursday in New York
        var reserved = org.mockito.ArgumentCaptor.forClass(List.class);
        verify(generations).submit(anyString(), anyLong(), reserved.capture(), any());
        assertEquals(1, reserved.getValue().size());
        service.generateDemo(demo);
        assertTrue(stored.containsKey(reserved.getValue().get(0)));

        var saturday = new DashboardDigestService(digests, context, generations, jobs, budget, layouts, users,
                Clock.fixed(Instant.parse("2026-10-03T16:00:00Z"), ZoneOffset.UTC), accounts);
        saturday.get(null);
        verify(budget).canStart(List.of());
    }
}
