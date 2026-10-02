package me.vestry.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import me.vestry.model.AiGeneration;
import me.vestry.model.DemoSession;
import me.vestry.model.User;
import me.vestry.repository.AiGenerationRepository;
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
    private final Instant now = Instant.parse("2026-10-02T03:00:00Z");
    private final Clock clock = Clock.fixed(now, ZoneOffset.UTC);
    private final DashboardDigestService service = new DashboardDigestService(digests, context, generations, jobs, budget, layouts, users, clock);
    private final User user = new User();
    private final Map<String, AiGeneration> stored = new HashMap<>();
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setup() {
        user.setId(7);
        when(users.getCurrentUser()).thenReturn(user);
        when(digests.available()).thenReturn(true);
        when(budget.canStart()).thenReturn(true);
        when(layouts.get(eq(user), any())).thenReturn(mapper.createObjectNode().put("showBriefing", true));
        when(jobs.findByRequestKey(anyString())).thenAnswer(i -> Optional.ofNullable(stored.get(i.getArgument(0))));
        when(context.capture()).thenReturn(new DigestContextService.Snapshot(7, false, now, List.of(), "{}"));
        when(digests.allowance(any())).thenReturn(30000L);
        when(generations.submit(anyString(), eq(30000L), any())).thenAnswer(i -> {
            var job = new AiGeneration(i.getArgument(0), now, LocalDate.of(2026, 10, 1), 30000);
            stored.put(i.getArgument(0), job);
            i.<Consumer<UUID>>getArgument(2).accept(job.getId());
            return job.getId();
        });
    }

    @Test
    void readingPrivateStatusDoesNotCaptureOrGenerateAndPostDeduplicatesTheDailyJob() {
        assertEquals(DashboardDigestService.Status.IDLE, service.get(null).status());
        verifyNoInteractions(context, generations);
        assertEquals(DashboardDigestService.Status.GENERATING, service.generate(null).status());
        assertEquals(DashboardDigestService.Status.GENERATING, service.generate(null).status());
        verify(context, times(1)).capture();
        verify(generations, times(1)).submit(anyString(), anyLong(), any());
        verify(digests).generate(any(), any());
        assertEquals(LocalDate.of(2026, 10, 1), service.get(null).day());
    }

    @Test
    void demoVisitorsShareOneKeyWhileOtherAccountsUseDistinctKeys() {
        user.setDemo(true);
        service.generate(new DemoSession()); service.generate(new DemoSession());
        assertEquals(1, stored.size());
        user.setId(8);
        service.generate(null);
        assertEquals(2, stored.size());
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
        when(budget.canStart()).thenReturn(false);
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
                Clock.fixed(now.plusSeconds(301), ZoneOffset.UTC));
        assertEquals(DashboardDigestService.Status.FAILED, later.get(null).status());
        later = new DashboardDigestService(digests, context, generations, jobs, budget, layouts, users,
                Clock.fixed(Instant.parse("2026-10-02T04:00:00Z"), ZoneOffset.UTC));
        assertEquals(DashboardDigestService.Status.IDLE, later.get(null).status());
    }

    @Test
    void rejectedReservationReturnsLimitedWithoutLeakingErrorText() {
        when(generations.submit(anyString(), anyLong(), any())).thenThrow(new IllegalStateException("provider details"));
        assertEquals(DashboardDigestService.Status.LIMITED, service.generate(null).status());
        verify(digests, never()).generate(any(), any());
    }
}
