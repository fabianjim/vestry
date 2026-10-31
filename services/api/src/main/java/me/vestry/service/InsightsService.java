package me.vestry.service;

import me.vestry.api.HindsightClient;
import me.vestry.api.HindsightClient.AttemptStatus;
import me.vestry.api.HindsightClient.Behavior;
import me.vestry.api.HindsightClient.BehaviorReport;
import me.vestry.api.HindsightClient.BehaviorReportList;
import me.vestry.api.HindsightClient.BehaviorReportResponse;
import me.vestry.api.HindsightClient.Citation;
import me.vestry.api.HindsightClient.Figure;
import me.vestry.api.HindsightClient.Need;
import me.vestry.api.HindsightClient.Previous;
import me.vestry.api.HindsightClient.ReportStatus;
import me.vestry.api.HindsightClient.ReportSummary;
import me.vestry.model.BehaviorFeedback;
import me.vestry.model.DemoSession;
import me.vestry.model.JournalEntry;
import me.vestry.model.JournalEntryType;
import me.vestry.model.Transaction;
import me.vestry.model.User;
import me.vestry.repository.JournalEntryRepository;
import me.vestry.repository.TransactionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Function;
import java.util.function.IntUnaryOperator;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Insights: vestry computes the facts, hindsight finds, narrates and keeps the behavior reports, and the page reads
 * them with vestry's own trades and entries filled in.
 */
@Service
public class InsightsService {
    private static final Logger log = LoggerFactory.getLogger(InsightsService.class);
    /** The kinds the page knows how to title and word; hindsight may add more later. */
    static final Set<String> KNOWN_KINDS = Set.of("no_plan", "undocumented", "emotional", "fomo", "hype", "run_up",
            "overtrading", "overconfidence", "price_action", "loss_aversion", "short_term", "risk_concentration",
            "position_sizing");
    static final int PAGE_SIZE = 10;

    public enum Status { IDLE, GENERATING, FAILED_TODAY }
    /** A run today that saved nothing: UNAVAILABLE counted for nothing, EMPTY found nothing that qualifies yet. */
    public enum RunOutcome { UNAVAILABLE, EMPTY }
    public record LastRun(RunOutcome outcome, Instant at, List<Need> needs) {}
    /** {@code lastRun} is this instance's memory of the user's latest run, shown until the next one starts. */
    public record Overview(Status status, boolean canGenerate, InsightGate.Blocked blockedReason,
                           List<ReportSummary> reports, boolean hasOlder, boolean unavailable, LastRun lastRun) {}
    public record OlderReports(List<ReportSummary> reports, boolean hasOlder, boolean unavailable) {}

    public record CitationView(int entryId, String quote, boolean entryExists) {}
    /** A trade or entry deleted since the report keeps its ID, with the rest left null. */
    public record TradeView(int tradeId, boolean tradeExists, String ticker, String side, Double shares, Double price,
                            Instant timestamp) {}
    public record EntryView(int entryId, boolean entryExists, JournalEntryType entryType, String ticker,
                            Instant timestamp, String body) {}
    public record NoteView(int entryId, Instant timestamp, String body) {}
    public record FeedbackView(BehaviorFeedback.Reaction reaction, String note) {}
    /** {@code feedback} is the reaction given on this report; {@code notes} are every entry written about the behavior. */
    public record BehaviorView(String kind, String subject, List<Figure> figures, Previous previous, String observation,
                               String question, List<CitationView> citations, List<TradeView> trades,
                               List<EntryView> entries, FeedbackView feedback, List<NoteView> notes) {}
    public record ReportView(LocalDate day, Instant generatedAt, LocalDate asOf, Instant entriesUpTo,
                             List<BehaviorView> behaviors, List<Need> needs) {}
    /** {@code report} is null when none was saved that day, or when hindsight couldn't be reached ({@code unavailable}). */
    public record ReportResult(ReportView report, boolean unavailable) {}

    public enum StartStatus { STARTED, BLOCKED, UNAVAILABLE }
    public record Start(StartStatus status, InsightGate.Blocked blockedReason) {
        static final Start STARTED = new Start(StartStatus.STARTED, null);
        static final Start UNAVAILABLE = new Start(StartStatus.UNAVAILABLE, null);
    }

    private enum JobState { RUNNING, SAVED, EMPTY, FAILED, UNAVAILABLE }
    private record Job(JobState state, Instant at, List<Need> needs) {}

    /** Where a report's IDs point: the user's own rows, or a demo visitor's copies of the template's. */
    private record Source(IntUnaryOperator entryId, IntUnaryOperator tradeId,
                          Function<Set<Integer>, Map<Integer, Transaction>> trades,
                          Function<Set<Integer>, Map<Integer, JournalEntry>> entries,
                          List<BehaviorFeedback> feedback, List<JournalEntry> notes) {}

    private final HindsightClient hindsight;
    private final InsightFactsService facts;
    private final InsightGate gate;
    private final InsightFeedbackService feedback;
    private final JournalEntryRepository entries;
    private final TransactionRepository transactions;
    private final Executor executor;
    private final Clock clock;
    /** Instance-local, like the rest of vestry's in-memory state: production is a single instance. */
    private final Map<Integer, Job> jobs = new ConcurrentHashMap<>();

    public InsightsService(HindsightClient hindsight, InsightFactsService facts, InsightGate gate,
                           InsightFeedbackService feedback, JournalEntryRepository entries,
                           TransactionRepository transactions, @Qualifier("insightsExecutor") Executor executor,
                           Clock clock) {
        this.hindsight = hindsight;
        this.facts = facts;
        this.gate = gate;
        this.feedback = feedback;
        this.entries = entries;
        this.transactions = transactions;
        this.executor = executor;
        this.clock = clock;
    }

    public boolean available() {
        return hindsight.isEnabled();
    }

    public Overview overview(User user) {
        var job = jobs.get(user.getId());
        boolean running = job != null && job.state() == JobState.RUNNING;
        var response = hindsight.listBehaviorReports(user.getId(), null, PAGE_SIZE);
        if (response.status() != ReportStatus.READY) {
            return new Overview(running ? Status.GENERATING : Status.IDLE, false, null, List.of(), false, true,
                    running ? null : lastRun(job));
        }
        var list = response.list();
        if (running) return new Overview(Status.GENERATING, false, null, summaries(list), list.hasOlder(), false, null);
        var blocked = blocked(user, list, job);
        return new Overview(blocked == InsightGate.Blocked.FAILED_TODAY ? Status.FAILED_TODAY : Status.IDLE,
                blocked == null, blocked, summaries(list), list.hasOlder(), false, lastRun(job));
    }

    /** Visitors read the template's reports. Their Generate is played in the browser, so it's open once one exists. */
    public Overview overviewDemo(User template) {
        var response = hindsight.listBehaviorReports(template.getId(), null, PAGE_SIZE);
        if (response.status() != ReportStatus.READY) {
            return new Overview(Status.IDLE, false, null, List.of(), false, true, null);
        }
        var reports = summaries(response.list());
        return new Overview(Status.IDLE, !reports.isEmpty(), null, reports, response.list().hasOlder(), false, null);
    }

    /** Summaries carry no IDs, so visitors read the template's through this too. */
    public OlderReports olderReports(User user, LocalDate before) {
        var response = hindsight.listBehaviorReports(user.getId(), before, PAGE_SIZE);
        if (response.status() != ReportStatus.READY) return new OlderReports(List.of(), false, true);
        return new OlderReports(summaries(response.list()), response.list().hasOlder(), false);
    }

    public ReportResult report(User user, LocalDate day) {
        int userId = user.getId();
        return report(userId, day, () -> new Source(id -> id, id -> id,
                ids -> ids.isEmpty() ? Map.of() : byId(transactions.findByUserIdAndIdIn(userId, ids), Transaction::getId),
                ids -> ids.isEmpty() ? Map.of() : byId(entries.findByUserIdAndIdIn(userId, ids), JournalEntry::getId),
                feedback.list(user),
                entries.findTop500ByUserIdAndBehaviorKeyIsNotNullOrderByTimestampDescIdDesc(userId)));
    }

    /** The template's report, pointing at the visitor's copies, with the visitor's own reactions and notes. */
    public ReportResult reportDemo(DemoSession session, User template, LocalDate day) {
        return report(template.getId(), day, () -> {
            List<Transaction> trades;
            List<JournalEntry> journal;
            synchronized (session) {
                trades = List.copyOf(session.getTransactions());
                journal = List.copyOf(session.getJournalEntries());
            }
            var entryCopies = session.copyIdsByTemplateId();
            var tradeCopies = session.copyTransactionIdsByTemplateId();
            var tradesById = byId(trades, Transaction::getId);
            var entriesById = byId(journal, JournalEntry::getId);
            var notes = journal.stream().filter(e -> e.getBehaviorKey() != null)
                    .sorted(Comparator.comparing(JournalEntry::getTimestamp).reversed()).toList();
            // a template ID without a copy is positive, so it never matches a copy's negative ID
            return new Source(id -> entryCopies.getOrDefault(id, id), id -> tradeCopies.getOrDefault(id, id),
                    ids -> only(tradesById, ids), ids -> only(entriesById, ids), feedback.listDemo(session), notes);
        });
    }

    private ReportResult report(int reportOwnerId, LocalDate day, Supplier<Source> source) {
        var response = hindsight.getBehaviorReport(reportOwnerId, day);
        if (response.status() != ReportStatus.READY) return new ReportResult(null, true);
        if (response.report() == null) return new ReportResult(null, false);
        return new ReportResult(hydrate(response.report(), source.get()), false);
    }

    /**
     * Starts today's report in the background, if the gate allows it. A click while one is running joins it.
     * Hindsight is read first for the newest report and the last attempt, so this answers within its 2 s timeout.
     */
    public Start generate(User user) {
        int userId = user.getId();
        if (running(userId)) return Start.STARTED;
        var response = hindsight.listBehaviorReports(userId, null, 1);
        if (response.status() != ReportStatus.READY) return Start.UNAVAILABLE;
        var blocked = blocked(user, response.list(), jobs.get(userId));
        if (blocked != null) return new Start(StartStatus.BLOCKED, blocked);
        if (!claim(userId)) return Start.STARTED;
        try {
            executor.execute(() -> run(user));
        } catch (RuntimeException rejected) {
            jobs.put(userId, new Job(JobState.UNAVAILABLE, clock.instant(), List.of()));
            return Start.UNAVAILABLE;
        }
        return Start.STARTED;
    }

    /** Daily for the demo template, so visitors always have a report to read. Skips the gate. */
    public BehaviorReportResponse generateDemo(User template) {
        return create(template);
    }

    private void run(User user) {
        var done = new Job(JobState.UNAVAILABLE, clock.instant(), List.of());
        try {
            var response = create(user);
            var report = response.report();
            done = switch (response.status()) {
                case READY -> report == null ? done
                        : report.saved() ? new Job(JobState.SAVED, clock.instant(), List.of())
                        : new Job(JobState.EMPTY, clock.instant(), needs(report.needs()));
                case FAILED_TODAY -> new Job(JobState.FAILED, clock.instant(), List.of());
                case UNAVAILABLE -> done;
            };
        } catch (RuntimeException failure) {
            // the class only: facts and entry text stay out of the logs
            log.warn("Insights report generation failed: {}", failure.getClass().getSimpleName());
        } finally {
            jobs.put(user.getId(), done);
        }
    }

    /** No transaction: the model call takes up to two minutes and must not hold a database connection. */
    private BehaviorReportResponse create(User user) {
        // the report covers changes up to here, not up to when hindsight saves it
        Instant factsFrom = clock.instant();
        var response = hindsight.createBehaviorReport(user.getId(), facts.build(user));
        var report = response.report();
        // hindsight returns today's earlier report as is; only a report saved from these facts moves the mark
        if (response.status() == ReportStatus.READY && report != null && report.saved()
                && report.generatedAt() != null && !report.generatedAt().isBefore(factsFrom)) {
            gate.reportSaved(user.getId(), factsFrom);
        }
        return response;
    }

    private boolean running(int userId) {
        var job = jobs.get(userId);
        return job != null && job.state() == JobState.RUNNING;
    }

    /** One run per user: of two clicks that both passed the gate, only the first starts one. */
    private boolean claim(int userId) {
        var claimed = new AtomicBoolean();
        jobs.compute(userId, (id, current) -> {
            if (current != null && current.state() == JobState.RUNNING) return current;
            claimed.set(true);
            return new Job(JobState.RUNNING, clock.instant(), List.of());
        });
        return claimed.get();
    }

    private InsightGate.Blocked blocked(User user, BehaviorReportList list, Job job) {
        var newest = list.reports().isEmpty() ? null : list.reports().get(0);
        var attempt = list.lastAttempt();
        LocalDate failedOn = attempt != null && attempt.status() == AttemptStatus.FAILED ? attempt.day() : null;
        // hindsight records the failure too; this covers a list read that raced the run's end
        if (job != null && job.state() == JobState.FAILED && today().equals(day(job.at()))) failedOn = today();
        return gate.blocked(user.getId(), newest == null ? null : newest.day(),
                newest == null ? null : newest.generatedAt(), failedOn);
    }

    private LastRun lastRun(Job job) {
        if (job == null || !today().equals(day(job.at()))) return null;
        return switch (job.state()) {
            case EMPTY -> new LastRun(RunOutcome.EMPTY, job.at(), job.needs());
            case UNAVAILABLE -> new LastRun(RunOutcome.UNAVAILABLE, job.at(), List.of());
            default -> null;
        };
    }

    private static List<ReportSummary> summaries(BehaviorReportList list) {
        return orEmpty(list.reports()).stream().filter(Objects::nonNull)
                .map(r -> new ReportSummary(r.day(), r.generatedAt(), orEmpty(r.behaviors()).stream()
                        .filter(b -> b != null && KNOWN_KINDS.contains(b.kind())).toList()))
                .toList();
    }

    private static ReportView hydrate(BehaviorReport report, Source source) {
        var known = orEmpty(report.behaviors()).stream().filter(b -> b != null && KNOWN_KINDS.contains(b.kind())).toList();
        Set<Integer> tradeIds = known.stream().flatMap(b -> orEmpty(b.tradeIds()).stream())
                .map(source.tradeId()::applyAsInt).collect(Collectors.toSet());
        Set<Integer> entryIds = known.stream()
                .flatMap(b -> Stream.concat(orEmpty(b.entryIds()).stream(), orEmpty(b.citations()).stream().map(Citation::entryId)))
                .map(source.entryId()::applyAsInt).collect(Collectors.toSet());
        var trades = source.trades().apply(tradeIds);
        var journal = source.entries().apply(entryIds);
        var notesByKey = source.notes().stream()
                .collect(Collectors.groupingBy(JournalEntry::getBehaviorKey, LinkedHashMap::new, Collectors.toList()));
        var behaviors = known.stream().map(b -> new BehaviorView(b.kind(), b.subject(), orEmpty(b.figures()),
                b.previous(), b.observation(), b.question(),
                orEmpty(b.citations()).stream().map(c -> {
                    int id = source.entryId().applyAsInt(c.entryId());
                    return new CitationView(id, c.quote(), journal.containsKey(id));
                }).toList(),
                orEmpty(b.tradeIds()).stream().map(source.tradeId()::applyAsInt).map(id -> trade(id, trades.get(id))).toList(),
                orEmpty(b.entryIds()).stream().map(source.entryId()::applyAsInt).map(id -> entry(id, journal.get(id))).toList(),
                feedbackOn(report.day(), b, source.feedback()),
                notesByKey.getOrDefault(b.subject() == null ? b.kind() : b.kind() + ":" + b.subject(), List.of()).stream()
                        .map(e -> new NoteView(e.getId(), e.getTimestamp(), e.getBody())).toList()))
                .toList();
        return new ReportView(report.day(), report.generatedAt(), report.asOf(), report.entriesUpTo(), behaviors,
                needs(report.needs()));
    }

    private static TradeView trade(int id, Transaction tx) {
        if (tx == null) return new TradeView(id, false, null, null, null, null, null);
        return new TradeView(id, true, tx.getTicker(), tx.getType().name(), tx.getShares(), tx.getPrice(), tx.getTimestamp());
    }

    private static EntryView entry(int id, JournalEntry entry) {
        if (entry == null) return new EntryView(id, false, null, null, null, null);
        return new EntryView(id, true, entry.getEntryType(), entry.getTicker(), entry.getTimestamp(), entry.getBody());
    }

    /** A reaction belongs to the report it was given on; a later report's reaction replaces it. */
    private static FeedbackView feedbackOn(LocalDate day, Behavior behavior, List<BehaviorFeedback> reactions) {
        return reactions.stream()
                .filter(f -> f.behavior().kind().equals(behavior.kind())
                        && Objects.equals(f.behavior().subject(), behavior.subject()) && day.equals(f.reportDay()))
                .findFirst().map(f -> new FeedbackView(f.reaction(), f.note())).orElse(null);
    }

    private static List<Need> needs(List<Need> needs) {
        return orEmpty(needs).stream().filter(n -> n != null && KNOWN_KINDS.contains(n.kind())).toList();
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(JournalEntryFilters.MARKET_ZONE));
    }

    private static LocalDate day(Instant instant) {
        return instant.atZone(JournalEntryFilters.MARKET_ZONE).toLocalDate();
    }

    private static <T> Map<Integer, T> byId(Collection<T> rows, Function<T, Integer> id) {
        return rows.stream().collect(Collectors.toMap(id, row -> row, (first, second) -> first));
    }

    private static <T> Map<Integer, T> only(Map<Integer, T> rows, Set<Integer> ids) {
        return ids.stream().filter(rows::containsKey).collect(Collectors.toMap(id -> id, rows::get));
    }

    private static <T> List<T> orEmpty(List<T> list) {
        return list == null ? List.of() : list;
    }
}
