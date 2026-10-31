package me.vestry.api;

import com.fasterxml.jackson.annotation.JsonFormat;
import me.vestry.model.BehaviorFeedback;
import me.vestry.model.RunUp;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

/** Calls hindsight, the AI service. Vestry must work without it, so nothing here throws. */
@Component
public class HindsightClient {
    private static final Logger log = LoggerFactory.getLogger(HindsightClient.class);

    /** Hindsight's contract caps a request at 200 entry IDs. */
    static final int MAX_BATCH = 200;
    static final int BREAKER_FAILURES = 3;
    static final Duration BREAKER_PAUSE = Duration.ofSeconds(30);
    /** A model call takes seconds and hindsight's own provider timeout is 30 s. */
    static final Duration AID_READ_TIMEOUT = Duration.ofSeconds(45);
    /** Building a report is one model call plus citation checks; the contract allows up to 120 s. */
    static final Duration REPORT_READ_TIMEOUT = Duration.ofSeconds(120);
    /** Hindsight's code for a POST on a day whose attempt failed, then or earlier. */
    static final String ATTEMPTED_TODAY = "ATTEMPTED_TODAY";

    public record Citation(int entryId, String quote) {}
    public record Claim(String summary, List<Citation> citations) {}
    /** Enum-like fields stay strings so a value hindsight adds later can't break parsing. */
    public record EntryInsight(Claim thesis, Claim exitCondition, String horizon, Integer conviction,
                               List<String> emotions, String ideaSource, List<String> tickers, List<String> themes) {}
    record Item(int entryId, EntryInsight insight) {}
    record Page(List<Item> insights) {}

    /** The RestTemplate's mapper writes dates as arrays; hindsight wants ISO text. */
    public record Trade(@JsonFormat(shape = JsonFormat.Shape.STRING) LocalDate day, String type, double shares, double price) {}
    /** What happened after the entry, from vestry's own data. */
    public record Since(Double priceNow, Double sharesNow, List<Trade> trades) {}
    public record ReflectionAid(List<Claim> recap, List<String> questions) {}
    public record AidResult(ReflectionAid aid, LocalDate generatedOn, int remainingToday) {}
    public enum AidStatus { READY, LIMITED, NOT_FOUND, UNAVAILABLE }
    public record AidResponse(AidStatus status, AidResult result) {
        public static AidResponse of(AidStatus status) { return new AidResponse(status, null); }
    }
    record AidRequest(List<Integer> laterEntryIds, Since since) {}
    public record SavedAid(int entryId, ReflectionAid aid, LocalDate generatedOn) {}
    record SavedAidPage(List<SavedAid> aids) {}

    /** Insights: vestry's market and ledger facts. Hindsight reads entry text itself and trusts these numbers. */
    public record BehaviorReportRequest(@JsonFormat(shape = JsonFormat.Shape.STRING) LocalDate asOf,
                                        Double portfolioValue, List<LedgerTrade> trades,
                                        List<HoldingPeriod> holdingPeriods, List<Position> holdings,
                                        List<Integer> autoEntryIds, List<Feedback> feedback,
                                        List<BehaviorNote> behaviorNotes) {}
    /**
     * The run-up, weight and outcome fields describe buys only. {@code outcomeKind} is SOLD (the buy's holding
     * period closed at {@code outcomePrice}) or LATEST (the period is open), all three null when unknown.
     */
    public record LedgerTrade(int tradeId, String ticker, String side, double shares, double price,
                              @JsonFormat(shape = JsonFormat.Shape.STRING) Instant timestamp, boolean initial,
                              Double runUp, RunUp.Status runUpStatus, Double weightAtBuy, Double outcomePrice,
                              String outcomeKind, @JsonFormat(shape = JsonFormat.Shape.STRING) LocalDate outcomeOn) {}
    /** {@code cost} is the period's total buy cost. */
    public record HoldingPeriod(String ticker, @JsonFormat(shape = JsonFormat.Shape.STRING) Instant openedAt,
                                @JsonFormat(shape = JsonFormat.Shape.STRING) Instant closedAt, double cost, Double pnl) {}
    /** An open position now; {@code weight} is its share of the portfolio value. */
    public record Position(String ticker, double marketValue, double weight, String sector, Double possibleMonthlyLoss) {}
    public record Feedback(String kind, String subject, BehaviorFeedback.Reaction reaction, String note,
                           @JsonFormat(shape = JsonFormat.Shape.STRING) LocalDate reportDay,
                           @JsonFormat(shape = JsonFormat.Shape.STRING) Instant at) {}
    public record BehaviorNote(String kind, String subject, int entryId) {}
    /** Kinds, subjects, keys and units stay strings, so a kind hindsight adds later parses; callers skip it. */
    public record Figure(String key, double value, String unit) {}
    /** {@code reason} is ENTRIES, TRADES, PRICES or FIELDS. */
    public record Need(String kind, String subject, int more, String reason) {}
    /** FAILED_TODAY only answers a POST: the day's attempt failed, so the day is used. */
    public enum ReportStatus { READY, FAILED_TODAY, UNAVAILABLE }

    /** Behavior reports. Kinds, subjects and figure keys stay strings: the vocabulary is open, and callers skip what they don't know. */
    public record Previous(LocalDate day, List<Figure> figures) {}
    public record Behavior(String kind, String subject, List<Figure> figures, Previous previous, String observation,
                           String question, List<Citation> citations, List<Integer> tradeIds, List<Integer> entryIds) {}
    /** An unsaved report ({@code saved} false, no behaviors) means nothing qualified; it didn't use the day. */
    public record BehaviorReport(LocalDate day, Instant generatedAt, LocalDate asOf, Instant entriesUpTo, boolean saved,
                                 List<Behavior> behaviors, List<Need> needs) {}
    public record BehaviorSummary(String kind, String subject, List<Figure> figures) {}
    public record ReportSummary(LocalDate day, Instant generatedAt, List<BehaviorSummary> behaviors) {}
    public enum AttemptStatus { SAVED, FAILED }
    public record Attempt(LocalDate day, AttemptStatus status, Instant at) {}
    /** Newest first. {@code lastAttempt} is null before the user's first attempt. */
    public record BehaviorReportList(List<ReportSummary> reports, boolean hasOlder, Attempt lastAttempt) {}
    record SavedBehaviorReport(BehaviorReport report) {}
    record Problem(String code, String detail) {}
    public record ReportListResponse(ReportStatus status, BehaviorReportList list) {
        static final ReportListResponse UNAVAILABLE = new ReportListResponse(ReportStatus.UNAVAILABLE, null);
    }
    /** READY with no report: none saved that day (GET). */
    public record BehaviorReportResponse(ReportStatus status, BehaviorReport report) {
        static final BehaviorReportResponse UNAVAILABLE = new BehaviorReportResponse(ReportStatus.UNAVAILABLE, null);
        static final BehaviorReportResponse FAILED_TODAY = new BehaviorReportResponse(ReportStatus.FAILED_TODAY, null);
    }

    private final RestTemplate http;
    private final RestTemplate aidHttp;
    private final RestTemplate reportHttp;
    private final String url;
    private final String token;
    private final Clock clock;
    private final AtomicInteger failures = new AtomicInteger();
    private volatile Instant pausedUntil = Instant.MIN;

    public HindsightClient(@Value("${vestry.hindsight.url:}") String url,
                           @Value("${vestry.hindsight.token:}") String token, Clock clock) {
        this.url = url.strip().replaceAll("/+$", "");
        this.token = token.strip();
        this.clock = clock;
        // hindsight's uvicorn can't take the default h2c upgrade: it drops the body of a POST
        var transport = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(1))
                .followRedirects(HttpClient.Redirect.NEVER).build();
        var factory = new JdkClientHttpRequestFactory(transport);
        factory.setReadTimeout(Duration.ofSeconds(2));
        http = new RestTemplate(factory);
        var aidFactory = new JdkClientHttpRequestFactory(transport);
        aidFactory.setReadTimeout(AID_READ_TIMEOUT);
        aidHttp = new RestTemplate(aidFactory);
        var reportFactory = new JdkClientHttpRequestFactory(transport);
        reportFactory.setReadTimeout(REPORT_READ_TIMEOUT);
        reportHttp = new RestTemplate(reportFactory);
    }

    public boolean isEnabled() {
        return !url.isBlank() && !token.isBlank();
    }

    /** Entries without an insight (not processed yet, or AI off) are absent from the result. */
    public Map<Integer, EntryInsight> insights(int userId, Collection<Integer> entryIds) {
        if (!isEnabled() || entryIds.isEmpty()) return Map.of();
        var ids = entryIds.stream().distinct().sorted().toList();
        var found = new HashMap<Integer, EntryInsight>();
        for (int start = 0; start < ids.size() && !paused(); start += MAX_BATCH) {
            fetch(userId, ids.subList(start, Math.min(start + MAX_BATCH, ids.size())), found);
        }
        return found;
    }

    /**
     * Runs on a user's click, so it waits for the model and skips the breaker:
     * the user asked for this answer, and page loads never depend on it.
     */
    public AidResponse reflectionAid(int userId, int entryId, List<Integer> laterEntryIds, Since since) {
        if (!isEnabled()) return AidResponse.of(AidStatus.UNAVAILABLE);
        var uri = UriComponentsBuilder.fromUriString(url).path("/v1/users/{userId}/entries/{entryId}/reflection-aid")
                .buildAndExpand(userId, entryId).toUri();
        var headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));
        try {
            var result = aidHttp.exchange(uri, HttpMethod.POST,
                    new HttpEntity<>(new AidRequest(laterEntryIds, since), headers), AidResult.class).getBody();
            if (result == null || result.aid() == null) throw new IllegalStateException("empty response");
            return new AidResponse(AidStatus.READY, result);
        } catch (RestClientResponseException failure) {
            int status = failure.getStatusCode().value();
            if (status == 429) return AidResponse.of(AidStatus.LIMITED);
            if (status == 404) return AidResponse.of(AidStatus.NOT_FOUND);
            if (status == 401) log.warn("Hindsight rejected the service token (HTTP 401)");
            else log.warn("Hindsight reflection aid request failed: HTTP {}", status);
        } catch (RuntimeException failure) {
            log.warn("Hindsight reflection aid request failed: {}", failure.getClass().getSimpleName());
        }
        return AidResponse.of(AidStatus.UNAVAILABLE);
    }

    /**
     * The newest saved aid per entry, from any day. Never generates, so demo visitors can be shown
     * the template's aids for free. Entries without one, or a failed request, are absent.
     */
    public Map<Integer, SavedAid> savedReflectionAids(int userId, Collection<Integer> entryIds) {
        if (!isEnabled() || entryIds.isEmpty()) return Map.of();
        var ids = entryIds.stream().distinct().sorted().toList();
        var found = new HashMap<Integer, SavedAid>();
        for (int start = 0; start < ids.size(); start += MAX_BATCH) {
            var batch = ids.subList(start, Math.min(start + MAX_BATCH, ids.size()));
            var uri = UriComponentsBuilder.fromUriString(url).path("/v1/users/{userId}/reflection-aids")
                    .queryParam("entryIds", batch.toArray()).buildAndExpand(userId).toUri();
            var headers = new HttpHeaders();
            headers.setBearerAuth(token);
            headers.setAccept(List.of(MediaType.APPLICATION_JSON));
            try {
                var page = http.exchange(uri, HttpMethod.GET, new HttpEntity<>(headers), SavedAidPage.class).getBody();
                if (page == null || page.aids() == null) throw new IllegalStateException("empty response");
                var requested = new HashSet<>(batch);
                for (var saved : page.aids()) {
                    if (saved.aid() != null && requested.contains(saved.entryId())) found.put(saved.entryId(), saved);
                }
            } catch (RestClientResponseException failure) {
                int status = failure.getStatusCode().value();
                if (status == 401) log.warn("Hindsight rejected the service token (HTTP 401)");
                else log.warn("Hindsight saved reflection aids request failed: HTTP {}", status);
            } catch (RuntimeException failure) {
                log.warn("Hindsight saved reflection aids request failed: {}", failure.getClass().getSimpleName());
            }
        }
        return found;
    }

    /** The user's saved reports, newest first and strictly before {@code before} if given. A page read: 2 s and the breaker. */
    public ReportListResponse listBehaviorReports(int userId, LocalDate before, int limit) {
        if (!isEnabled() || paused()) return ReportListResponse.UNAVAILABLE;
        var uri = UriComponentsBuilder.fromUriString(url).path("/v1/users/{userId}/behavior-reports")
                .queryParamIfPresent("before", Optional.ofNullable(before))
                .queryParam("limit", limit).buildAndExpand(userId).toUri();
        try {
            var list = http.exchange(uri, HttpMethod.GET, new HttpEntity<>(readHeaders()), BehaviorReportList.class).getBody();
            if (list == null || list.reports() == null) throw new IllegalStateException("empty response");
            failures.set(0);
            return new ReportListResponse(ReportStatus.READY, list);
        } catch (RestClientResponseException failure) {
            readFailed("list", failure.getStatusCode().value());
        } catch (RuntimeException failure) {
            log.warn("Hindsight behavior report list failed: {}", failure.getClass().getSimpleName());
            failed();
        }
        return ReportListResponse.UNAVAILABLE;
    }

    /** The report saved on {@code day}, or READY with none. A page read: 2 s and the breaker. Never generates. */
    public BehaviorReportResponse getBehaviorReport(int userId, LocalDate day) {
        if (!isEnabled() || paused()) return BehaviorReportResponse.UNAVAILABLE;
        var uri = UriComponentsBuilder.fromUriString(url).path("/v1/users/{userId}/behavior-reports/{day}")
                .buildAndExpand(userId, day.toString()).toUri();
        try {
            var saved = http.exchange(uri, HttpMethod.GET, new HttpEntity<>(readHeaders()), SavedBehaviorReport.class).getBody();
            if (saved == null) throw new IllegalStateException("empty response");
            failures.set(0);
            return new BehaviorReportResponse(ReportStatus.READY, saved.report());
        } catch (RestClientResponseException failure) {
            readFailed("read", failure.getStatusCode().value());
        } catch (RuntimeException failure) {
            log.warn("Hindsight behavior report read failed: {}", failure.getClass().getSimpleName());
            failed();
        }
        return BehaviorReportResponse.UNAVAILABLE;
    }

    /**
     * Generates today's report. Runs in the background after a user's click, so it waits for the model and skips
     * the breaker. READY is today's new or already saved report, or an unsaved empty one; FAILED_TODAY means the
     * day's attempt failed (now or earlier) and counts; UNAVAILABLE means nothing was recorded.
     */
    public BehaviorReportResponse createBehaviorReport(int userId, BehaviorReportRequest facts) {
        if (!isEnabled()) return BehaviorReportResponse.UNAVAILABLE;
        var uri = UriComponentsBuilder.fromUriString(url).path("/v1/users/{userId}/behavior-reports")
                .buildAndExpand(userId).toUri();
        var headers = readHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        try {
            var report = reportHttp.exchange(uri, HttpMethod.POST, new HttpEntity<>(facts, headers), BehaviorReport.class).getBody();
            if (report == null) throw new IllegalStateException("empty response");
            return new BehaviorReportResponse(ReportStatus.READY, report);
        } catch (RestClientResponseException failure) {
            int status = failure.getStatusCode().value();
            if (status == 409 && ATTEMPTED_TODAY.equals(problemCode(failure))) return BehaviorReportResponse.FAILED_TODAY;
            // 503: AI off, budget refused or a failure before the model call; 404: hindsight predates behavior reports
            if (status == 401) log.warn("Hindsight rejected the service token (HTTP 401)");
            else if (status == 422) log.error("Hindsight rejected vestry's behavior report facts (HTTP 422); a row should have been left out");
            else log.warn("Hindsight behavior report generation failed: HTTP {}", status);
        } catch (RuntimeException failure) {
            log.warn("Hindsight behavior report generation failed: {}", failure.getClass().getSimpleName());
        }
        return BehaviorReportResponse.UNAVAILABLE;
    }

    private HttpHeaders readHeaders() {
        var headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));
        return headers;
    }

    private void readFailed(String what, int status) {
        if (status == 401) log.warn("Hindsight rejected the service token (HTTP 401)");
        else log.warn("Hindsight behavior report {} failed: HTTP {}", what, status);
        failed();
    }

    /** The Problem body's code, or null if there is none to read. */
    private static String problemCode(RestClientResponseException failure) {
        try {
            var problem = failure.getResponseBodyAs(Problem.class);
            return problem == null ? null : problem.code();
        } catch (RuntimeException unreadable) {
            return null;
        }
    }

    private void fetch(int userId, List<Integer> ids, Map<Integer, EntryInsight> found) {
        // repeated keys: hindsight rejects a comma-separated list
        var uri = UriComponentsBuilder.fromUriString(url).path("/v1/users/{userId}/insights")
                .queryParam("entryIds", ids.toArray()).buildAndExpand(userId).toUri();
        var headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));
        try {
            var page = http.exchange(uri, HttpMethod.GET, new HttpEntity<>(headers), Page.class).getBody();
            if (page == null || page.insights() == null) throw new IllegalStateException("empty response");
            var requested = new HashSet<>(ids);
            for (var item : page.insights()) {
                if (item.insight() != null && requested.contains(item.entryId())) found.put(item.entryId(), item.insight());
            }
            failures.set(0);
        } catch (RestClientResponseException failure) {
            int status = failure.getStatusCode().value();
            if (status == 401) log.warn("Hindsight rejected the service token (HTTP 401)");
            else log.warn("Hindsight insights request failed: HTTP {}", status);
            failed();
        } catch (RuntimeException failure) {
            log.warn("Hindsight insights request failed: {}", failure.getClass().getSimpleName());
            failed();
        }
    }

    private boolean paused() {
        return clock.instant().isBefore(pausedUntil);
    }

    /** The count only resets on success, so one more failure after a pause pauses again. */
    private void failed() {
        if (failures.incrementAndGet() >= BREAKER_FAILURES) {
            pausedUntil = clock.instant().plus(BREAKER_PAUSE);
            log.warn("Hindsight skipped for {}s after {} failures in a row", BREAKER_PAUSE.toSeconds(), failures.get());
        }
    }
}
