package me.vestry.service;

import me.vestry.api.HindsightClient;
import me.vestry.api.HindsightClient.Figure;
import me.vestry.api.HindsightClient.Need;
import me.vestry.api.HindsightClient.PatternReport;
import me.vestry.api.HindsightClient.BehaviorReportRequest;
import me.vestry.api.HindsightClient.ReportResponse;
import me.vestry.api.HindsightClient.ReportStatus;
import me.vestry.model.DemoSession;
import me.vestry.model.JournalEntry;
import me.vestry.model.User;
import me.vestry.repository.JournalEntryRepository;
import me.vestry.service.InsightsService.Citation;
import me.vestry.service.InsightsService.Insights;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class InsightsServiceTest {
    @Mock HindsightClient hindsight;
    @Mock InsightFactsService facts;
    @Mock JournalEntryRepository entries;
    InsightsService service;

    // 22:00 on oct 26 in new york
    private static final Clock LATE = Clock.fixed(Instant.parse("2026-10-27T02:00:00Z"), ZoneOffset.UTC);
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 26);

    private final User user = user(4);

    @BeforeEach
    void setUp() {
        service = new InsightsService(hindsight, facts, entries, LATE);
    }

    @Test
    void marksDeletedEntriesWithOneScopedLookupAndSkipsUnknownKinds() {
        when(hindsight.patternReport(4)).thenReturn(ready(report(TODAY.minusDays(1), true,
                pattern("felt_vs_did", 12, 13), pattern("news_drift", 99))));
        when(entries.findOwnedIds(eq(4), argThat(ids -> Set.copyOf(ids).equals(Set.of(12, 13))))).thenReturn(List.of(12));

        var insights = service.report(user);

        var patterns = insights.report().patterns();
        assertEquals(List.of("felt_vs_did"), patterns.stream().map(InsightsService.Pattern::kind).toList());
        assertEquals(List.of(new Citation(12, "quote 12", true), new Citation(13, "quote 13", false)), patterns.get(0).citations());
        assertEquals(List.of(new Need("silent_trades", 2)), insights.report().needs());
        assertEquals(new Insights(insights.report(), true, false), insights);
    }

    @Test
    void canRefreshUntilTodaysReportIsSaved() {
        when(hindsight.patternReport(4)).thenReturn(ready(report(TODAY, true)));
        assertFalse(service.report(user).canRefresh(), "today in new york, though already tomorrow in utc");

        when(hindsight.patternReport(4)).thenReturn(ready(report(TODAY.minusDays(1), true)));
        assertTrue(service.report(user).canRefresh());

        when(hindsight.patternReport(4)).thenReturn(ready(null));
        assertEquals(new Insights(null, true, false), service.report(user));

        when(hindsight.patternReport(4)).thenReturn(unavailable());
        assertEquals(new Insights(null, false, true), service.report(user));
        verifyNoInteractions(entries);
    }

    @Test
    void refreshSendsVestrysFactsAndReportsWhenHindsightCannot() {
        var request = new BehaviorReportRequest(TODAY, null, List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
        when(facts.build(user)).thenReturn(request);
        when(hindsight.createPatternReport(4, request)).thenReturn(ready(report(TODAY, true)));
        assertFalse(service.refresh(user).canRefresh());

        // nothing qualified: hindsight didn't save or spend, so trying again later is fine
        when(hindsight.createPatternReport(4, request)).thenReturn(ready(report(TODAY, false)));
        assertTrue(service.refresh(user).canRefresh());

        when(hindsight.createPatternReport(4, request)).thenReturn(unavailable());
        assertNull(service.refresh(user));
    }

    @Test
    void demoVisitorsReadTheTemplatesReportThroughTheirOwnCopies() {
        var template = user(1);
        var session = new DemoSession();
        session.setTemplateEntryIds(Map.of(-1, 12, -2, 13));
        // the visitor deleted their copy of 13
        session.setJournalEntries(List.of(entry(-1)));
        when(hindsight.patternReport(1)).thenReturn(ready(report(TODAY.minusDays(1), true, pattern("open_theses", 12, 13, 14))));

        var insights = service.reportDemo(session, template);

        assertEquals(List.of(new Citation(-1, "quote 12", true), new Citation(-2, "quote 13", false),
                new Citation(14, "quote 14", false)), insights.report().patterns().get(0).citations());
        assertFalse(insights.canRefresh());
        verifyNoInteractions(entries, facts);
        verify(hindsight, never()).createPatternReport(anyInt(), any());
    }

    private static ReportResponse ready(PatternReport report) {
        return new ReportResponse(ReportStatus.READY, report);
    }

    private static ReportResponse unavailable() {
        return new ReportResponse(ReportStatus.UNAVAILABLE, null);
    }

    private static PatternReport report(LocalDate generatedOn, boolean saved, HindsightClient.Pattern... patterns) {
        return new PatternReport(generatedOn, generatedOn, Instant.parse("2026-10-20T14:00:00Z"), saved, List.of(patterns),
                List.of(new Need("silent_trades", 2), new Need("news_drift", 1)));
    }

    private static HindsightClient.Pattern pattern(String kind, int... cited) {
        return new HindsightClient.Pattern(kind, null, List.of(new Figure("entries", 4, "count")), "An observation.",
                "A question?", java.util.Arrays.stream(cited)
                        .mapToObj(id -> new HindsightClient.Citation(id, "quote " + id)).toList());
    }

    private static JournalEntry entry(int id) {
        var entry = new JournalEntry();
        entry.setId(id);
        return entry;
    }

    private static User user(int id) {
        var user = new User();
        user.setId(id);
        return user;
    }
}
