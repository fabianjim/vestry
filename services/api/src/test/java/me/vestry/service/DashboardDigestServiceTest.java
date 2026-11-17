package me.vestry.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import me.vestry.api.HindsightClient;
import me.vestry.api.HindsightClient.BriefingAttempt;
import me.vestry.api.HindsightClient.BriefingAttemptStatus;
import me.vestry.api.HindsightClient.BriefingStatus;
import me.vestry.api.HindsightClient.LatestBriefing;
import me.vestry.dto.DigestContent;
import me.vestry.dto.NewsBriefing;
import me.vestry.model.DemoSession;
import me.vestry.model.User;
import me.vestry.service.DashboardDigestService.Status;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.RejectedExecutionException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class DashboardDigestServiceTest {
    // 23:00 on Oct 1 in New York
    private static final Instant NOW = Instant.parse("2026-10-02T03:00:00Z");
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 1);
    private static final HindsightClient.BriefingRequest FACTS =
            new HindsightClient.BriefingRequest(NOW, false, 0.0, List.of(), List.of());

    private final HindsightClient hindsight = mock(HindsightClient.class);
    private final BriefingFactsService facts = mock(BriefingFactsService.class);
    private final DashboardLayoutService layouts = mock(DashboardLayoutService.class);
    private final DemoSessionResolver users = mock(DemoSessionResolver.class);
    private final List<Runnable> background = new ArrayList<>();
    private final DashboardDigestService service = new DashboardDigestService(hindsight, facts, layouts, users,
            background::add, Clock.fixed(NOW, ZoneOffset.UTC));
    private final ObjectMapper mapper = new ObjectMapper();
    private final User user = new User();

    @BeforeEach
    void setup() {
        user.setId(7);
        when(users.getCurrentUser()).thenReturn(user);
        when(hindsight.isEnabled()).thenReturn(true);
        when(layouts.get(eq(user), any())).thenReturn(mapper.createObjectNode().put("showBriefing", true));
        latest(null, null);
        when(facts.capture(user)).thenReturn(FACTS);
        when(hindsight.createBriefing(anyInt(), any())).thenReturn(new HindsightClient.BriefingResponse(BriefingStatus.READY, null));
    }

    private void latest(HindsightClient.Briefing briefing, BriefingAttempt today) {
        when(hindsight.latestBriefing(7)).thenReturn(Optional.of(new LatestBriefing(briefing, today)));
    }

    private static HindsightClient.Briefing briefing(LocalDate day, String destination, String newsStatus) {
        return new HindsightClient.Briefing(UUID.fromString("6f1c1f0e-8a52-4a3e-9d55-0b9e3c1a2b7d"), day, NOW, NOW,
                new HindsightClient.BriefingContent("Microsoft reported earnings.", "You added to MSFT.",
                        List.of(new HindsightClient.BriefingQuestion("Record why you added", destination)),
                        List.of(new HindsightClient.BriefingSource("MSFT earnings", "", null, "https://example.com/msft")),
                        newsStatus));
    }

    private static BriefingAttempt attempt(LocalDate day, BriefingAttemptStatus status) {
        return new BriefingAttempt(day, status, NOW);
    }

    @Test
    void readsNeverCaptureAndAClickPostsOnceInTheBackground() {
        assertEquals(new DashboardDigestService.State(Status.IDLE, TODAY, null), service.get(null));
        verifyNoInteractions(facts);

        assertEquals(Status.GENERATING, service.generate(null).status());
        assertEquals(Status.GENERATING, service.generate(null).status());
        assertEquals(Status.GENERATING, service.get(null).status());
        verify(facts, times(1)).capture(user);
        verify(hindsight, never()).createBriefing(anyInt(), any());

        background.forEach(Runnable::run);
        verify(hindsight).createBriefing(7, FACTS);
        latest(briefing(TODAY, "JOURNAL", "READY"), attempt(TODAY, BriefingAttemptStatus.SAVED));
        assertEquals(Status.READY, service.get(null).status());
        assertEquals(1, background.size());
    }

    @Test
    void mapsTheBriefingAndFallsBackOnValuesItDoesNotKnow() {
        latest(briefing(TODAY, "NEW_VIEW", "LATER"), null);

        var digest = service.get(null).digest();

        assertEquals(new DashboardDigestService.Digest(UUID.fromString("6f1c1f0e-8a52-4a3e-9d55-0b9e3c1a2b7d"), NOW, NOW,
                new DigestContent("Microsoft reported earnings.", "You added to MSFT.",
                        List.of(new DigestContent.Question("Record why you added", DigestContent.Destination.JOURNAL)),
                        List.of(new NewsBriefing.Item("MSFT earnings", "", null, "https://example.com/msft")),
                        NewsBriefing.Status.UNAVAILABLE, false)),
                digest);
    }

    @ParameterizedTest
    @CsvSource({
            "0, RUNNING, , GENERATING",
            "0, SAVED, 0, READY",
            "0, FAILED, -1, FAILED",
            "-1, FAILED, -1, IDLE",
            ", , 0, READY",
            ", , -1, IDLE"})
    void followsHindsightsAttemptAndLatestBriefing(Integer attemptDay, BriefingAttemptStatus status, Integer briefingDay,
                                                    Status expected) {
        latest(briefingDay == null ? null : briefing(TODAY.plusDays(briefingDay), "JOURNAL", "READY"),
                attemptDay == null ? null : attempt(TODAY.plusDays(attemptDay), status));

        var state = service.get(null);

        assertEquals(expected, state.status());
        assertEquals(briefingDay != null, state.digest() != null, "the latest briefing shows in every state");
        assertEquals(expected == Status.IDLE ? Status.GENERATING : expected, service.generate(null).status(),
                "only IDLE starts a briefing");
        verify(facts, times(expected == Status.IDLE ? 1 : 0)).capture(user);
    }

    @Test
    void offHiddenOrUnreachableNeverPost() {
        when(hindsight.isEnabled()).thenReturn(false);
        assertEquals(Status.DISABLED, service.generate(null).status());
        verifyNoInteractions(layouts);

        when(hindsight.isEnabled()).thenReturn(true);
        when(layouts.get(user, null)).thenReturn(mapper.createObjectNode().put("showBriefing", false));
        assertEquals(new DashboardDigestService.State(Status.HIDDEN, TODAY, null), service.generate(null));
        verify(hindsight, never()).latestBriefing(anyInt());

        when(layouts.get(user, null)).thenReturn(mapper.createObjectNode().put("showBriefing", true));
        when(hindsight.latestBriefing(7)).thenReturn(Optional.empty());
        assertEquals(new DashboardDigestService.State(Status.DISABLED, TODAY, null), service.generate(null));
        verifyNoInteractions(facts);
        assertTrue(background.isEmpty());
    }

    @Test
    void aRefusedPostShowsLimitedOnceThenAllowsAnotherTry() {
        when(hindsight.createBriefing(anyInt(), any())).thenReturn(new HindsightClient.BriefingResponse(BriefingStatus.LIMITED, null));
        service.generate(null);
        background.forEach(Runnable::run);

        assertEquals(Status.LIMITED, service.get(null).status());
        assertEquals(Status.IDLE, service.get(null).status(), "check again");
        assertEquals(Status.GENERATING, service.generate(null).status());
    }

    @Test
    void aBriefingThatCouldNotStartIsLimitedAndFreesTheUser() {
        var rejecting = new DashboardDigestService(hindsight, facts, layouts, users,
                task -> { throw new RejectedExecutionException("full"); }, Clock.fixed(NOW, ZoneOffset.UTC));

        assertEquals(Status.LIMITED, rejecting.generate(null).status());
        assertEquals(Status.IDLE, rejecting.get(null).status());
    }

    @Test
    void demoVisitorsOnlyReadAndTheScheduleUsesTheTemplatesFacts() {
        user.setDemo(true);
        latest(briefing(TODAY.minusDays(1), "JOURNAL", "READY"), null);

        var state = service.generate(new DemoSession());

        assertEquals(Status.IDLE, state.status());
        assertTrue(state.digest().content().demoTemplate());
        verifyNoInteractions(facts);
        assertTrue(background.isEmpty());

        var demoFacts = new HindsightClient.BriefingRequest(NOW, true, 0.0, List.of(), List.of());
        when(facts.captureDemo(user)).thenReturn(demoFacts);
        clearInvocations(layouts, users);
        assertEquals(BriefingStatus.READY, service.generateDemo(user));
        verify(hindsight).createBriefing(7, demoFacts);
        verifyNoInteractions(layouts, users);
    }
}
