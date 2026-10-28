package me.vestry.service;

import me.vestry.api.HindsightClient;
import me.vestry.api.HindsightClient.Figure;
import me.vestry.api.HindsightClient.Need;
import me.vestry.api.HindsightClient.PatternReport;
import me.vestry.api.HindsightClient.ReportResponse;
import me.vestry.api.HindsightClient.ReportStatus;
import me.vestry.model.DemoSession;
import me.vestry.model.JournalEntry;
import me.vestry.model.User;
import me.vestry.repository.JournalEntryRepository;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.function.IntUnaryOperator;
import java.util.stream.Collectors;

/** Insights: vestry computes the facts, hindsight finds and narrates the patterns, the page reads the saved report. */
@Service
public class InsightsService {
    /** The kinds the page knows how to title and word; hindsight may add more later. */
    static final Set<String> KNOWN_KINDS = Set.of("felt_vs_did", "outcomes_by_state", "horizon_vs_holding",
            "gains_vs_losses", "silent_trades", "open_theses");

    private final HindsightClient hindsight;
    private final InsightFactsService facts;
    private final JournalEntryRepository entries;
    private final Clock clock;

    public InsightsService(HindsightClient hindsight, InsightFactsService facts, JournalEntryRepository entries, Clock clock) {
        this.hindsight = hindsight;
        this.facts = facts;
        this.entries = entries;
        this.clock = clock;
    }

    public record Citation(int entryId, String quote, boolean entryExists) {}
    public record Pattern(String kind, String subject, List<Figure> figures, String observation, String question,
                          List<Citation> citations) {}
    public record Report(LocalDate generatedOn, LocalDate asOf, Instant entriesUpTo, boolean saved,
                         List<Pattern> patterns, List<Need> needs) {}
    /** {@code report} is null when there's none yet, or when hindsight couldn't be reached ({@code unavailable}). */
    public record Insights(Report report, boolean canRefresh, boolean unavailable) {}

    public boolean available() {
        return hindsight.isEnabled();
    }

    public Insights report(User user) {
        var response = hindsight.patternReport(user.getId());
        if (response.status() != ReportStatus.READY) return new Insights(null, false, true);
        var report = forPage(response.report(), id -> id, existingIn(user));
        return new Insights(report, !refreshedToday(report), false);
    }

    /**
     * Null when hindsight couldn't build one. No transaction: the model call takes seconds and must not
     * hold a database connection.
     */
    public Insights refresh(User user) {
        var response = hindsight.createPatternReport(user.getId(), facts.build(user));
        if (response.status() != ReportStatus.READY || response.report() == null) return null;
        var report = forPage(response.report(), id -> id, existingIn(user));
        return new Insights(report, !refreshedToday(report), false);
    }

    /** Visitors read the template's report, cited through their own copies. They never refresh. */
    public Insights reportDemo(DemoSession session, User template) {
        var response = hindsight.patternReport(template.getId());
        if (response.status() != ReportStatus.READY) return new Insights(null, false, true);
        var copies = session.copyIdsByTemplateId();
        Set<Integer> present = session.getJournalEntries().stream().map(JournalEntry::getId).collect(Collectors.toSet());
        var report = forPage(response.report(), id -> copies.getOrDefault(id, id),
                cited -> cited.stream().filter(present::contains).collect(Collectors.toSet()));
        return new Insights(report, false, false);
    }

    /** Nightly for the demo template, so visitors always have a report to read. */
    public ReportResponse refreshDemo(User template) {
        return hindsight.createPatternReport(template.getId(), facts.build(template));
    }

    /** Which of the cited entries still exist, in one lookup scoped to the user. */
    private Function<Collection<Integer>, Set<Integer>> existingIn(User user) {
        return cited -> cited.isEmpty() ? Set.of() : Set.copyOf(entries.findOwnedIds(user.getId(), cited));
    }

    private static Report forPage(PatternReport report, IntUnaryOperator toPageId,
                                  Function<Collection<Integer>, Set<Integer>> existing) {
        if (report == null) return null;
        var known = orEmpty(report.patterns()).stream().filter(Objects::nonNull)
                .filter(p -> KNOWN_KINDS.contains(p.kind())).toList();
        Set<Integer> cited = known.stream().flatMap(p -> orEmpty(p.citations()).stream())
                .map(c -> toPageId.applyAsInt(c.entryId())).collect(Collectors.toSet());
        Set<Integer> exists = existing.apply(cited);
        var patterns = known.stream().map(p -> new Pattern(p.kind(), p.subject(), orEmpty(p.figures()),
                p.observation(), p.question(), orEmpty(p.citations()).stream().map(c -> {
                    int id = toPageId.applyAsInt(c.entryId());
                    return new Citation(id, c.quote(), exists.contains(id));
                }).toList())).toList();
        var needs = orEmpty(report.needs()).stream().filter(n -> n != null && KNOWN_KINDS.contains(n.kind())).toList();
        return new Report(report.generatedOn(), report.asOf(), report.entriesUpTo(), report.saved(), patterns, needs);
    }

    /** Hindsight saves one report per New York day and returns it again, so a second refresh today is pointless. */
    private boolean refreshedToday(Report report) {
        return report != null && report.saved()
                && LocalDate.now(clock.withZone(JournalEntryFilters.MARKET_ZONE)).equals(report.generatedOn());
    }

    private static <T> List<T> orEmpty(List<T> list) {
        return list == null ? List.of() : list;
    }
}
