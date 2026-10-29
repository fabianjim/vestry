package me.vestry.service;

import me.vestry.api.HindsightClient;
import me.vestry.api.HindsightClient.Attempt;
import me.vestry.api.HindsightClient.AttemptStatus;
import me.vestry.api.HindsightClient.Behavior;
import me.vestry.api.HindsightClient.BehaviorReport;
import me.vestry.api.HindsightClient.BehaviorReportList;
import me.vestry.api.HindsightClient.BehaviorReportRequest;
import me.vestry.api.HindsightClient.BehaviorReportResponse;
import me.vestry.api.HindsightClient.BehaviorSummary;
import me.vestry.api.HindsightClient.Citation;
import me.vestry.api.HindsightClient.Need;
import me.vestry.api.HindsightClient.ReportListResponse;
import me.vestry.api.HindsightClient.ReportStatus;
import me.vestry.api.HindsightClient.ReportSummary;
import me.vestry.model.BehaviorFeedback;
import me.vestry.model.BehaviorFeedback.Reaction;
import me.vestry.model.BehaviorKey;
import me.vestry.model.DemoSession;
import me.vestry.model.JournalEntry;
import me.vestry.model.JournalEntryType;
import me.vestry.model.Transaction;
import me.vestry.model.User;
import me.vestry.repository.JournalEntryRepository;
import me.vestry.repository.TransactionRepository;
import me.vestry.service.InsightGate.Blocked;
import me.vestry.service.InsightsService.CitationView;
import me.vestry.service.InsightsService.EntryView;
import me.vestry.service.InsightsService.FeedbackView;
import me.vestry.service.InsightsService.LastRun;
import me.vestry.service.InsightsService.NoteView;
import me.vestry.service.InsightsService.ReportResult;
import me.vestry.service.InsightsService.RunOutcome;
import me.vestry.service.InsightsService.Start;
import me.vestry.service.InsightsService.StartStatus;
import me.vestry.service.InsightsService.Status;
import me.vestry.service.InsightsService.TradeView;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.RejectedExecutionException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class InsightsServiceTest {
    @Mock HindsightClient hindsight;
    @Mock InsightFactsService facts;
    @Mock InsightGate gate;
    @Mock InsightFeedbackService feedback;
    @Mock JournalEntryRepository entries;
    @Mock TransactionRepository transactions;
    /** Generation runs only when a test runs what was handed to the executor. */
    private final List<Runnable> tasks = new ArrayList<>();
    // 11:00 on oct 29 in new york
    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-29T15:00:00Z"));
    InsightsService service;

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 29);
    private static final LocalDate DAY = LocalDate.of(2026, 10, 28);
    private static final Instant GENERATED = Instant.parse("2026-10-28T14:10:00Z");
    private static final BehaviorReportRequest FACTS = new BehaviorReportRequest(TODAY, null, List.of(), List.of(),
            List.of(), List.of(), List.of(), List.of());

    private final User user = user(4);

    @BeforeEach
    void setUp() {
        service = new InsightsService(hindsight, facts, gate, feedback, entries, transactions, tasks::add, clock);
    }

    // overview

    @Test
    void unavailableListCannotGenerate() {
        when(hindsight.listBehaviorReports(4, null, InsightsService.PAGE_SIZE)).thenReturn(listUnavailable());

        var overview = service.overview(user);

        assertTrue(overview.unavailable());
        assertFalse(overview.canGenerate());
        assertEquals(Status.IDLE, overview.status());
        verifyNoInteractions(gate);
    }

    @Test
    void canGenerateFollowsTheGateAndDropsUnknownKinds() {
        var summary = new ReportSummary(DAY, GENERATED, List.of(new BehaviorSummary("run_up", null, List.of()),
                new BehaviorSummary("new_kind", null, List.of())));
        when(hindsight.listBehaviorReports(4, null, InsightsService.PAGE_SIZE))
                .thenReturn(listReady(new BehaviorReportList(List.of(summary), true, null)));
        when(gate.blocked(eq(4), any(), any(), any())).thenReturn(null, Blocked.NOTHING_NEW, Blocked.FAILED_TODAY);

        var open = service.overview(user);
        assertTrue(open.canGenerate());
        assertNull(open.blockedReason());
        assertEquals(Status.IDLE, open.status());
        assertTrue(open.hasOlder());
        assertEquals(List.of(new ReportSummary(DAY, GENERATED, List.of(new BehaviorSummary("run_up", null, List.of())))),
                open.reports());

        var nothingNew = service.overview(user);
        assertFalse(nothingNew.canGenerate());
        assertEquals(Blocked.NOTHING_NEW, nothingNew.blockedReason());
        assertEquals(Status.IDLE, nothingNew.status());

        var failed = service.overview(user);
        assertFalse(failed.canGenerate());
        assertEquals(Status.FAILED_TODAY, failed.status());
    }

    @Test
    void gateGetsTheNewestReportAndOnlyAFailedAttemptsDay() {
        var newest = new ReportSummary(DAY, GENERATED, List.of());
        var older = new ReportSummary(DAY.minusDays(7), GENERATED.minus(Duration.ofDays(7)), List.of());
        var failed = new Attempt(DAY, AttemptStatus.FAILED, GENERATED);
        var saved = new Attempt(DAY, AttemptStatus.SAVED, GENERATED);
        when(hindsight.listBehaviorReports(4, null, InsightsService.PAGE_SIZE))
                .thenReturn(listReady(new BehaviorReportList(List.of(newest, older), false, failed)))
                .thenReturn(listReady(new BehaviorReportList(List.of(newest, older), false, saved)))
                .thenReturn(listReady(new BehaviorReportList(List.of(), false, null)));

        service.overview(user);
        service.overview(user);
        service.overview(user);

        verify(gate).blocked(4, DAY, GENERATED, DAY);
        verify(gate).blocked(4, DAY, GENERATED, null);
        verify(gate).blocked(4, null, null, null);
    }

    // generate

    @Test
    void blockedGenerateNeverStartsARun() {
        when(hindsight.listBehaviorReports(4, null, 1)).thenReturn(listReady(emptyList()));
        when(gate.blocked(4, null, null, null)).thenReturn(Blocked.UPDATED_TODAY);

        assertEquals(new Start(StartStatus.BLOCKED, Blocked.UPDATED_TODAY), service.generate(user));
        assertTrue(tasks.isEmpty());
        verifyNoInteractions(facts);
    }

    @Test
    void generateIsUnavailableWithoutTheList() {
        when(hindsight.listBehaviorReports(4, null, 1)).thenReturn(listUnavailable());

        assertEquals(new Start(StartStatus.UNAVAILABLE, null), service.generate(user));
        assertTrue(tasks.isEmpty());
        verifyNoInteractions(gate);
    }

    @Test
    void overviewShowsGeneratingUntilTheRunFinishes() {
        stubLists();
        when(facts.build(user)).thenReturn(FACTS);
        when(hindsight.createBehaviorReport(4, FACTS)).thenReturn(ready(report(TODAY, clock.instant(), false, List.of(), List.of())));

        var run = start();
        verifyNoInteractions(facts);
        var generating = service.overview(user);
        assertEquals(Status.GENERATING, generating.status());
        assertFalse(generating.canGenerate());

        run.run();
        assertEquals(Status.IDLE, service.overview(user).status());
    }

    @Test
    void aSecondClickJoinsTheRunningReport() {
        stubLists();
        start();

        assertEquals(new Start(StartStatus.STARTED, null), service.generate(user));

        assertTrue(tasks.isEmpty(), "no second run is handed to the executor");
        verify(hindsight, times(1)).listBehaviorReports(4, null, 1);
    }

    @Test
    void aRejectedRunIsUnavailableAndDoesNotLeaveTheUserGenerating() {
        service = new InsightsService(hindsight, facts, gate, feedback, entries, transactions,
                task -> { throw new RejectedExecutionException("queue full"); }, clock);
        stubLists();

        assertEquals(new Start(StartStatus.UNAVAILABLE, null), service.generate(user));

        var overview = service.overview(user);
        assertEquals(Status.IDLE, overview.status());
        assertTrue(overview.canGenerate());
        assertEquals(RunOutcome.UNAVAILABLE, overview.lastRun().outcome());
    }

    // run outcomes

    @Test
    void aSavedReportMovesTheMarkToWhenTheFactsWereRead() {
        stubLists();
        var run = start();
        clock.advance(Duration.ofSeconds(5));
        Instant factsFrom = clock.instant();
        when(facts.build(user)).thenAnswer(read -> {
            clock.advance(Duration.ofMinutes(2));
            return FACTS;
        });
        when(hindsight.createBehaviorReport(eq(4), same(FACTS)))
                .thenAnswer(post -> ready(report(TODAY, clock.instant(), true, List.of(), List.of())));

        run.run();

        verify(gate).reportSaved(4, factsFrom);
        var overview = service.overview(user);
        assertEquals(Status.IDLE, overview.status());
        assertNull(overview.lastRun());
    }

    @Test
    void anUnsavedEmptyReportIsShownWithItsKnownNeeds() {
        stubLists();
        var run = start();
        when(facts.build(user)).thenReturn(FACTS);
        when(hindsight.createBehaviorReport(4, FACTS)).thenReturn(ready(report(TODAY, clock.instant(), false, List.of(),
                List.of(new Need("price_action", null, 2, "ENTRIES"), new Need("new_kind", null, 1, "TRADES")))));

        run.run();

        assertEquals(new LastRun(RunOutcome.EMPTY, clock.instant(), List.of(new Need("price_action", null, 2, "ENTRIES"))),
                service.overview(user).lastRun());
        verify(gate, never()).reportSaved(anyInt(), any());
    }

    @Test
    void todaysEarlierReportReturnedAsIsDoesNotMoveTheMark() {
        stubLists();
        var run = start();
        when(facts.build(user)).thenReturn(FACTS);
        when(hindsight.createBehaviorReport(4, FACTS))
                .thenReturn(ready(report(TODAY, clock.instant().minus(Duration.ofHours(1)), true, List.of(), List.of())));

        run.run();

        verify(gate, never()).reportSaved(anyInt(), any());
        assertNull(service.overview(user).lastRun());
    }

    @Test
    void aFailedRunBlocksTodayBeforeTheListShowsTheAttempt() {
        stubLists();
        var run = start();
        when(facts.build(user)).thenReturn(FACTS);
        when(hindsight.createBehaviorReport(4, FACTS)).thenReturn(new BehaviorReportResponse(ReportStatus.FAILED_TODAY, null));
        run.run();
        // the list's lastAttempt is still null; the run's own failure supplies today
        when(gate.blocked(4, null, null, TODAY)).thenReturn(Blocked.FAILED_TODAY);

        var overview = service.overview(user);

        assertEquals(Status.FAILED_TODAY, overview.status());
        assertFalse(overview.canGenerate());
        verify(gate).blocked(4, null, null, TODAY);
    }

    @Test
    void anUnavailableOrThrowingRunIsShownAsUnavailable() {
        stubLists();
        when(facts.build(user)).thenReturn(FACTS).thenThrow(new IllegalStateException("prices"));
        when(hindsight.createBehaviorReport(4, FACTS)).thenReturn(new BehaviorReportResponse(ReportStatus.UNAVAILABLE, null));

        start().run();
        assertEquals(RunOutcome.UNAVAILABLE, service.overview(user).lastRun().outcome());

        var throwing = start();
        assertDoesNotThrow(throwing::run);
        var overview = service.overview(user);
        assertEquals(Status.IDLE, overview.status());
        assertEquals(RunOutcome.UNAVAILABLE, overview.lastRun().outcome());
    }

    @Test
    void theLastRunDisappearsOnTheNextNewYorkDay() {
        // 19:00 on oct 29 in new york
        clock.set(Instant.parse("2026-10-29T23:00:00Z"));
        stubLists();
        var run = start();
        when(facts.build(user)).thenReturn(FACTS);
        when(hindsight.createBehaviorReport(4, FACTS)).thenReturn(ready(report(TODAY, clock.instant(), false, List.of(), List.of())));
        run.run();

        clock.advance(Duration.ofHours(3));
        assertNotNull(service.overview(user).lastRun(), "already oct 30 in utc, still oct 29 in new york");
        clock.advance(Duration.ofHours(3));
        assertNull(service.overview(user).lastRun());
    }

    // report

    @Test
    void reportLooksUpItsTradesAndEntriesAndMarksDeletedOnes() {
        when(hindsight.getBehaviorReport(4, DAY)).thenReturn(ready(report(DAY, GENERATED, true,
                List.of(behavior("run_up", null, List.of(7, 19), List.of(12, 20),
                        new Citation(12, "it keeps climbing"), new Citation(21, "deleted since"))), List.of())));
        when(transactions.findByUserIdAndIdIn(eq(4), argThat(ids -> Set.copyOf(ids).equals(Set.of(7, 19)))))
                .thenReturn(List.of(trade(7)));
        when(entries.findByUserIdAndIdIn(eq(4), argThat(ids -> Set.copyOf(ids).equals(Set.of(12, 20, 21)))))
                .thenReturn(List.of(entry(12)));

        var behavior = service.report(user, DAY).report().behaviors().get(0);

        assertEquals(List.of(new TradeView(7, true, "NVDA", "BUY", 3.0, 120.5, Instant.parse("2026-10-20T14:00:00Z")),
                new TradeView(19, false, null, null, null, null, null)), behavior.trades());
        assertEquals(List.of(new EntryView(12, true, JournalEntryType.BUY, "NVDA", Instant.parse("2026-10-20T14:00:00Z"), "entry 12"),
                new EntryView(20, false, null, null, null, null)), behavior.entries());
        assertEquals(List.of(new CitationView(12, "it keeps climbing", true), new CitationView(21, "deleted since", false)),
                behavior.citations());
    }

    @Test
    void reportDropsUnknownKindsAndTheirLookups() {
        when(hindsight.getBehaviorReport(4, DAY)).thenReturn(ready(report(DAY, GENERATED, true,
                List.of(behavior("new_kind", null, List.of(99), List.of(98)), behavior("fomo", null, List.of(), List.of())),
                List.of(new Need("new_kind", null, 1, "ENTRIES"), new Need("hype", null, 2, "TRADES")))));

        var report = service.report(user, DAY).report();

        assertEquals(List.of("fomo"), report.behaviors().stream().map(InsightsService.BehaviorView::kind).toList());
        assertEquals(List.of(new Need("hype", null, 2, "TRADES")), report.needs());
        verify(transactions, never()).findByUserIdAndIdIn(anyInt(), any());
        verify(entries, never()).findByUserIdAndIdIn(anyInt(), any());
    }

    @Test
    void feedbackShowsOnlyOnTheReportAndBehaviorItWasGivenOn() {
        when(hindsight.getBehaviorReport(4, DAY)).thenReturn(ready(report(DAY, GENERATED, true,
                List.of(behavior("run_up", null, List.of(), List.of()), behavior("emotional", "anxious", List.of(), List.of())),
                List.of())));
        when(feedback.list(user)).thenReturn(List.of(
                reaction("emotional", "calm", DAY, Reaction.FITS),
                reaction("run_up", null, DAY.minusDays(14), Reaction.KNEW),
                reaction("fomo", null, DAY, Reaction.FITS),
                reaction("run_up", null, DAY, Reaction.DOESNT_FIT)));

        var behaviors = service.report(user, DAY).report().behaviors();

        assertEquals(new FeedbackView(Reaction.DOESNT_FIT, "note"), behaviors.get(0).feedback());
        assertNull(behaviors.get(1).feedback());
    }

    @Test
    void notesAreGroupedByBehaviorKey() {
        when(hindsight.getBehaviorReport(4, DAY)).thenReturn(ready(report(DAY, GENERATED, true,
                List.of(behavior("fomo", null, List.of(), List.of()), behavior("emotional", "anxious", List.of(), List.of())),
                List.of())));
        when(entries.findTop500ByUserIdAndBehaviorKeyIsNotNullOrderByTimestampDescIdDesc(4)).thenReturn(List.of(
                note(34, "fomo"), note(33, "emotional:calm"), note(32, "emotional:anxious"), note(31, "fomo")));

        var behaviors = service.report(user, DAY).report().behaviors();

        assertEquals(List.of(34, 31), behaviors.get(0).notes().stream().map(NoteView::entryId).toList());
        assertEquals(List.of(new NoteView(32, Instant.parse("2026-10-20T14:00:00Z"), "entry 32")), behaviors.get(1).notes());
    }

    @Test
    void reportIsUnavailableWhenHindsightIsAndNullWhenNoneWasSaved() {
        when(hindsight.getBehaviorReport(4, DAY)).thenReturn(new BehaviorReportResponse(ReportStatus.UNAVAILABLE, null))
                .thenReturn(ready(null));

        assertEquals(new ReportResult(null, true), service.report(user, DAY));
        assertEquals(new ReportResult(null, false), service.report(user, DAY));
        verifyNoInteractions(transactions, entries, feedback);
    }

    // demo

    @Test
    void demoReportPointsAtTheVisitorsCopiesFromTheSession() {
        var template = user(1);
        var session = new DemoSession();
        session.setTemplateEntryIds(Map.of(-1, 12, -2, 20));
        session.getTemplateTransactionIds().put(-3, 7);
        session.setTransactions(new ArrayList<>(List.of(trade(-3))));
        // the visitor deleted their copy of entry 20; entry 21 and trade 19 were never copied
        session.setJournalEntries(new ArrayList<>(List.of(entry(-1), note(-5, "run_up"))));
        when(hindsight.getBehaviorReport(1, DAY)).thenReturn(ready(report(DAY, GENERATED, true,
                List.of(behavior("run_up", null, List.of(7, 19), List.of(12, 20), new Citation(12, "q"), new Citation(21, "r"))),
                List.of())));
        when(feedback.listDemo(session)).thenReturn(List.of(reaction("run_up", null, DAY, Reaction.FITS)));

        var behavior = service.reportDemo(session, template, DAY).report().behaviors().get(0);

        assertEquals(List.of(new TradeView(-3, true, "NVDA", "BUY", 3.0, 120.5, Instant.parse("2026-10-20T14:00:00Z")),
                new TradeView(19, false, null, null, null, null, null)), behavior.trades());
        assertEquals(List.of(true, false), behavior.entries().stream().map(EntryView::entryExists).toList());
        assertEquals(List.of(-1, -2), behavior.entries().stream().map(EntryView::entryId).toList());
        assertEquals(List.of(new CitationView(-1, "q", true), new CitationView(21, "r", false)), behavior.citations());
        assertEquals(new FeedbackView(Reaction.FITS, "note"), behavior.feedback());
        assertEquals(List.of(-5), behavior.notes().stream().map(NoteView::entryId).toList());
        verifyNoInteractions(transactions, entries);
        verify(feedback, never()).list(any());
    }

    @Test
    void demoOverviewCanGenerateOnceTheTemplateHasAReportAndNeverAsksTheGate() {
        var template = user(1);
        when(hindsight.listBehaviorReports(1, null, InsightsService.PAGE_SIZE))
                .thenReturn(listReady(new BehaviorReportList(List.of(new ReportSummary(DAY, GENERATED, List.of())), false, null)))
                .thenReturn(listReady(emptyList()));

        assertTrue(service.overviewDemo(template).canGenerate());
        assertFalse(service.overviewDemo(template).canGenerate());
        verifyNoInteractions(gate);
    }

    @Test
    void demoGenerationSkipsTheGateAndPostsTheFacts() {
        var template = user(1);
        var response = ready(report(TODAY, clock.instant(), true, List.of(), List.of()));
        when(facts.build(template)).thenReturn(FACTS);
        when(hindsight.createBehaviorReport(1, FACTS)).thenReturn(response);

        assertEquals(response, service.generateDemo(template));
        verify(gate, never()).blocked(anyInt(), any(), any(), any());
        assertTrue(tasks.isEmpty(), "the scheduler waits for it");
    }

    /** Both list reads (generate's and the overview's) answer with no reports and no attempt. */
    private void stubLists() {
        when(hindsight.listBehaviorReports(eq(4), isNull(), anyInt())).thenReturn(listReady(emptyList()));
    }

    private Runnable start() {
        assertEquals(new Start(StartStatus.STARTED, null), service.generate(user));
        assertEquals(1, tasks.size());
        return tasks.remove(0);
    }

    private static BehaviorReportList emptyList() {
        return new BehaviorReportList(List.of(), false, null);
    }

    private static ReportListResponse listReady(BehaviorReportList list) {
        return new ReportListResponse(ReportStatus.READY, list);
    }

    private static ReportListResponse listUnavailable() {
        return new ReportListResponse(ReportStatus.UNAVAILABLE, null);
    }

    private static BehaviorReportResponse ready(BehaviorReport report) {
        return new BehaviorReportResponse(ReportStatus.READY, report);
    }

    private static BehaviorReport report(LocalDate day, Instant generatedAt, boolean saved, List<Behavior> behaviors,
                                         List<Need> needs) {
        return new BehaviorReport(day, generatedAt, day, generatedAt, saved, behaviors, needs);
    }

    private static Behavior behavior(String kind, String subject, List<Integer> tradeIds, List<Integer> entryIds,
                                     Citation... citations) {
        return new Behavior(kind, subject, List.of(), null, "An observation.", "A question?", List.of(citations),
                tradeIds, entryIds);
    }

    private static BehaviorFeedback reaction(String kind, String subject, LocalDate reportDay, Reaction reaction) {
        return new BehaviorFeedback(new BehaviorKey(kind, subject), reportDay, reaction, "note", GENERATED);
    }

    private static Transaction trade(int id) {
        var trade = new Transaction("NVDA", 3, 120.5, Transaction.TransactionType.BUY);
        trade.setId(id);
        trade.setTimestamp(Instant.parse("2026-10-20T14:00:00Z"));
        return trade;
    }

    private static JournalEntry entry(int id) {
        var entry = new JournalEntry();
        entry.setId(id);
        entry.setEntryType(JournalEntryType.BUY);
        entry.setTicker("NVDA");
        entry.setTimestamp(Instant.parse("2026-10-20T14:00:00Z"));
        entry.setBody("entry " + id);
        return entry;
    }

    private static JournalEntry note(int id, String behaviorKey) {
        var note = entry(id);
        note.setEntryType(JournalEntryType.REFLECTION);
        note.setBehaviorKey(behaviorKey);
        return note;
    }

    private static User user(int id) {
        var user = new User();
        user.setId(id);
        return user;
    }

    private static final class MutableClock extends Clock {
        private Instant now;

        MutableClock(Instant now) { this.now = now; }

        void set(Instant instant) { now = instant; }
        void advance(Duration duration) { now = now.plus(duration); }

        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(now, zone); }
        @Override public Instant instant() { return now; }
    }
}
