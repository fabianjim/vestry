package me.vestry.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import me.vestry.model.RunUp;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;

/** Runs against a real local server so timeouts and refused connections are real. */
class HindsightClientTest {

    private static final String TOKEN = "t".repeat(64);
    private static final String INSIGHT = """
            {"thesis": {"summary": "Data center demand lasts",
                        "citations": [{"entryId": 7, "quote": "demand looks durable"}]},
             "exitCondition": null, "horizon": "years", "conviction": 4, "emotions": ["fomo"],
             "ideaSource": null, "tickers": ["NVDA"], "themes": ["AI capex"], "addedLater": true}
            """;

    private HttpServer server;
    private final List<String> requests = new CopyOnWriteArrayList<>();
    private final List<String> tokens = new CopyOnWriteArrayList<>();
    private final List<String> bodies = new CopyOnWriteArrayList<>();
    private final List<String> upgrades = new CopyOnWriteArrayList<>();
    private final MutableClock clock = new MutableClock();
    private volatile int status = 200;
    private volatile String body = "{\"insights\": []}";
    private volatile String contentType = "application/json";
    private volatile long delayMillis = 0;

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            requests.add(exchange.getRequestURI().getRawPath() + "?" + exchange.getRequestURI().getRawQuery());
            tokens.add(exchange.getRequestHeaders().getFirst("Authorization"));
            upgrades.add(String.valueOf(exchange.getRequestHeaders().getFirst("Upgrade")));
            bodies.add(exchange.getRequestMethod() + " " + new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            try {
                Thread.sleep(delayMillis);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private HindsightClient client() {
        return new HindsightClient("http://127.0.0.1:" + server.getAddress().getPort() + "/", TOKEN, clock);
    }

    @Test
    void isOffAndSilentWithoutAUrlOrToken() {
        var noUrl = new HindsightClient(" ", TOKEN, clock);
        var noToken = new HindsightClient("http://127.0.0.1:" + server.getAddress().getPort(), "", clock);

        assertFalse(noUrl.isEnabled());
        assertFalse(noToken.isEnabled());
        assertEquals(Map.of(), noUrl.insights(4, List.of(7)));
        assertEquals(Map.of(), noToken.insights(4, List.of(7)));
        assertEquals(Map.of(), client().insights(4, List.of()));
        for (var off : List.of(noUrl, noToken)) {
            assertEquals(HindsightClient.ReportListResponse.UNAVAILABLE, off.listBehaviorReports(4, null, 10));
            assertEquals(HindsightClient.BehaviorReportResponse.UNAVAILABLE, off.getBehaviorReport(4, LocalDate.of(2026, 10, 28)));
            assertEquals(HindsightClient.BehaviorReportResponse.UNAVAILABLE, off.createBehaviorReport(4, FACTS));
        }
        assertTrue(requests.isEmpty());
    }

    @Test
    void fetchesInsightsWithRepeatedIdsAndTheServiceToken() {
        body = "{\"insights\": [{\"entryId\": 7, \"insight\": " + INSIGHT + "}], \"addedLater\": 1}";

        var found = client().insights(4, List.of(8, 7, 8));

        assertEquals(List.of("/v1/users/4/insights?entryIds=7&entryIds=8"), requests);
        assertEquals(List.of("Bearer " + TOKEN), tokens);
        assertEquals(Set.of(7), found.keySet());
        var insight = found.get(7);
        assertEquals("Data center demand lasts", insight.thesis().summary());
        assertEquals(List.of(new HindsightClient.Citation(7, "demand looks durable")), insight.thesis().citations());
        assertNull(insight.exitCondition());
        assertEquals("years", insight.horizon());
        assertEquals(4, insight.conviction());
        assertEquals(List.of("fomo"), insight.emotions());
        assertEquals(List.of("NVDA"), insight.tickers());
    }

    @Test
    void ignoresEntriesItDidNotAskFor() {
        body = "{\"insights\": [{\"entryId\": 9, \"insight\": " + INSIGHT + "}]}";

        assertEquals(Map.of(), client().insights(4, List.of(7)));
    }

    @ParameterizedTest
    @ValueSource(ints = {401, 422, 500, 503})
    void errorResponsesReturnNothing(int code) {
        status = code;

        assertEquals(Map.of(), client().insights(4, List.of(7)));
    }

    @Test
    void malformedJsonReturnsNothing() {
        body = "{\"insights\": [";

        assertEquals(Map.of(), client().insights(4, List.of(7)));
    }

    @Test
    void unreachableServiceReturnsNothing() {
        var client = client();
        server.stop(0);

        assertEquals(Map.of(), client.insights(4, List.of(7)));
    }

    @Test
    void slowServiceTimesOutInsteadOfHoldingThePage() {
        delayMillis = 5_000;
        long started = System.nanoTime();

        var found = client().insights(4, List.of(7));

        assertEquals(Map.of(), found);
        assertTrue(Duration.ofNanos(System.nanoTime() - started).toMillis() < 4_000, "read timeout should cut it off");
    }

    @Test
    void skipsHindsightAfterRepeatedFailuresThenTriesAgain() {
        var client = client();
        status = 500;
        for (int i = 0; i < HindsightClient.BREAKER_FAILURES; i++) client.insights(4, List.of(7));
        assertEquals(HindsightClient.BREAKER_FAILURES, requests.size());

        client.insights(4, List.of(7));
        assertEquals(HindsightClient.BREAKER_FAILURES, requests.size(), "paused calls never reach hindsight");

        clock.advance(HindsightClient.BREAKER_PAUSE.plusSeconds(1));
        status = 200;
        body = "{\"insights\": [{\"entryId\": 7, \"insight\": " + INSIGHT + "}]}";
        assertEquals(Set.of(7), client.insights(4, List.of(7)).keySet());

        status = 500;
        client.insights(4, List.of(7));
        client.insights(4, List.of(7));
        assertEquals(HindsightClient.BREAKER_FAILURES + 3, requests.size(), "a success resets the failure count");
    }

    @Test
    void oneFailureAfterAPausePausesAgain() {
        var client = client();
        status = 500;
        for (int i = 0; i < HindsightClient.BREAKER_FAILURES; i++) client.insights(4, List.of(7));
        clock.advance(HindsightClient.BREAKER_PAUSE.plusSeconds(1));

        client.insights(4, List.of(7));
        client.insights(4, List.of(7));

        assertEquals(HindsightClient.BREAKER_FAILURES + 1, requests.size());
    }

    @Test
    void splitsLargeRequestsIntoBatchesTheContractAccepts() {
        var ids = IntStream.rangeClosed(1, 450).boxed().toList();

        client().insights(4, ids);

        assertEquals(3, requests.size());
        assertEquals(List.of(200, 200, 50), requests.stream()
                .map(request -> request.split("entryIds=", -1).length - 1).toList());
        assertTrue(requests.get(2).endsWith("entryIds=450"));
    }

    private static final String AID = """
            {"aid": {"recap": [{"summary": "You later called the dip overdone",
                                "citations": [{"entryId": 52, "quote": "the dip was overdone"}]}],
                     "questions": ["What made this look like a dip?"], "addedLater": 1},
             "generatedOn": "2026-10-25", "remainingToday": 9}
            """;
    private static final HindsightClient.Since SINCE = new HindsightClient.Since(142.3, 15.0,
            List.of(new HindsightClient.Trade(LocalDate.of(2026, 3, 4), "BUY", 5, 131.2)));

    @Test
    void postsTheReflectionAidRequestAndReadsTheResult() throws Exception {
        body = AID;

        var response = client().reflectionAid(4, 7, List.of(52), SINCE);

        assertEquals("/v1/users/4/entries/7/reflection-aid?null", requests.get(0));
        assertEquals(List.of("Bearer " + TOKEN), tokens);
        // uvicorn drops a POST body that asks for an h2c upgrade
        assertEquals(List.of("null"), upgrades);
        var sent = new ObjectMapper().readTree(bodies.get(0).substring("POST ".length()));
        assertTrue(bodies.get(0).startsWith("POST "));
        assertEquals(List.of(52), List.of(sent.get("laterEntryIds").get(0).asInt()));
        assertEquals(142.3, sent.get("since").get("priceNow").asDouble());
        assertEquals("2026-03-04", sent.get("since").get("trades").get(0).get("day").asText());
        assertEquals(HindsightClient.AidStatus.READY, response.status());
        var result = response.result();
        assertEquals(LocalDate.of(2026, 10, 25), result.generatedOn());
        assertEquals(9, result.remainingToday());
        assertEquals(List.of("What made this look like a dip?"), result.aid().questions());
        assertEquals(new HindsightClient.Citation(52, "the dip was overdone"),
                result.aid().recap().get(0).citations().get(0));
    }

    @ParameterizedTest
    @CsvSource({"429, LIMITED", "404, NOT_FOUND", "503, UNAVAILABLE", "401, UNAVAILABLE", "500, UNAVAILABLE"})
    void mapsReflectionAidErrors(int code, HindsightClient.AidStatus expected) {
        status = code;

        var response = client().reflectionAid(4, 7, List.of(), SINCE);

        assertEquals(expected, response.status());
        assertNull(response.result());
    }

    @Test
    void reflectionAidSurvivesBadResponsesAndOutages() {
        body = "{\"aid\": [";
        assertEquals(HindsightClient.AidStatus.UNAVAILABLE, client().reflectionAid(4, 7, List.of(), SINCE).status());

        var client = client();
        server.stop(0);
        assertEquals(HindsightClient.AidStatus.UNAVAILABLE, client.reflectionAid(4, 7, List.of(), SINCE).status());
        assertEquals(HindsightClient.AidStatus.UNAVAILABLE,
                new HindsightClient("", TOKEN, clock).reflectionAid(4, 7, List.of(), SINCE).status());
    }

    @Test
    void reflectionAidWaitsLongerThanPageReads() {
        body = AID;
        delayMillis = 3_000;

        assertEquals(HindsightClient.AidStatus.READY, client().reflectionAid(4, 7, List.of(), SINCE).status());
    }

    @Test
    void reflectionAidIgnoresTheBreakerAndDoesNotFeedIt() {
        var client = client();
        status = 500;
        for (int i = 0; i < HindsightClient.BREAKER_FAILURES; i++) client.insights(4, List.of(7));

        status = 200;
        body = AID;
        assertEquals(HindsightClient.AidStatus.READY, client.reflectionAid(4, 7, List.of(), SINCE).status());

        clock.advance(HindsightClient.BREAKER_PAUSE.plusSeconds(1));
        status = 500;
        client.reflectionAid(4, 7, List.of(), SINCE);
        client.reflectionAid(4, 7, List.of(), SINCE);
        status = 200;
        body = "{\"insights\": []}";
        int before = requests.size();
        client.insights(4, List.of(7));
        assertEquals(before + 1, requests.size(), "aid failures never pause page reads");
    }

    @Test
    void readsSavedReflectionAidsWithoutGenerating() {
        body = """
                {"aids": [{"entryId": 7, "aid": {"recap": [], "questions": ["Why then?"]}, "generatedOn": "2026-10-22"},
                          {"entryId": 9, "aid": {"recap": [], "questions": []}, "generatedOn": "2026-10-22"}]}
                """;

        var found = client().savedReflectionAids(5, List.of(8, 7, 7));

        assertEquals(List.of("/v1/users/5/reflection-aids?entryIds=7&entryIds=8"), requests);
        assertEquals("GET ", bodies.get(0));
        assertEquals(Set.of(7), found.keySet(), "ids it didn't ask for are ignored");
        assertEquals(LocalDate.of(2026, 10, 22), found.get(7).generatedOn());
        assertEquals(List.of("Why then?"), found.get(7).aid().questions());
    }

    @ParameterizedTest
    @ValueSource(ints = {401, 422, 500})
    void savedReflectionAidFailuresReturnNothing(int code) {
        status = code;

        assertEquals(Map.of(), client().savedReflectionAids(5, List.of(7)));
    }

    @Test
    void savedReflectionAidsAreOffWithoutConfigurationOrIds() {
        assertEquals(Map.of(), new HindsightClient("", TOKEN, clock).savedReflectionAids(5, List.of(7)));
        assertEquals(Map.of(), client().savedReflectionAids(5, List.of()));
        assertTrue(requests.isEmpty());
    }

    private static final String REPORT = """
            {"generatedOn": "2026-10-27", "asOf": "2026-10-27", "entriesUpTo": "2026-10-27T14:03:00+00:00",
             "saved": true, "addedLater": 1,
             "patterns": [{"kind": "felt_vs_did", "subject": "anxious",
                           "figures": [{"key": "entries", "value": 4, "unit": "count"},
                                       {"key": "addedLater", "value": 1, "unit": "weeks"}],
                           "observation": "You often bought soon after writing that you felt anxious.",
                           "question": "What did buying settle for you?",
                           "citations": [{"entryId": 12, "quote": "I'm nervous about this"}]},
                          {"kind": "news_drift", "subject": null, "figures": [], "observation": "o",
                           "question": "q", "citations": [], "addedLater": true}],
             "needs": [{"kind": "silent_trades", "more": 2}]}
            """;
    private static final HindsightClient.BehaviorReportRequest FACTS = new HindsightClient.BehaviorReportRequest(
            LocalDate.of(2026, 10, 27), null,
            List.of(new HindsightClient.LedgerTrade(7, "NVDA", "BUY", 3, 120.5, Instant.parse("2026-03-03T15:00:00Z"), false,
                    null, RunUp.Status.PENDING, 1.0, 141.2, "LATEST", LocalDate.of(2026, 10, 27))),
            List.of(new HindsightClient.HoldingPeriod("NVDA", Instant.parse("2026-03-03T15:00:00Z"), null, 361.5, 62.1)),
            List.of(), List.of(3, 9), List.of(), List.of());

    @Test
    void readsTheSavedReportAndKeepsWhatItDoesNotKnow() {
        body = "{\"report\": " + REPORT + "}";

        var response = client().patternReport(4);

        assertEquals(List.of("/v1/users/4/pattern-report?null"), requests);
        assertEquals("GET ", bodies.get(0));
        assertEquals(List.of("Bearer " + TOKEN), tokens);
        assertEquals(HindsightClient.ReportStatus.READY, response.status());
        var report = response.report();
        assertEquals(LocalDate.of(2026, 10, 27), report.generatedOn());
        assertEquals(Instant.parse("2026-10-27T14:03:00Z"), report.entriesUpTo());
        assertTrue(report.saved());
        var felt = report.patterns().get(0);
        assertEquals("anxious", felt.subject());
        assertEquals(new HindsightClient.Figure("entries", 4, "count"), felt.figures().get(0));
        assertEquals(new HindsightClient.Citation(12, "I'm nervous about this"), felt.citations().get(0));
        // unknown kinds, keys and units still parse; the service decides what to show
        assertEquals("news_drift", report.patterns().get(1).kind());
        assertEquals("weeks", felt.figures().get(1).unit());
        assertEquals(List.of(new HindsightClient.Need("silent_trades", null, 2, null)), report.needs());
    }

    @Test
    void noSavedReportIsReadyAndEmpty() {
        body = "{\"report\": null}";

        assertEquals(new HindsightClient.ReportResponse(HindsightClient.ReportStatus.READY, null), client().patternReport(4));
    }

    @ParameterizedTest
    @ValueSource(ints = {401, 404, 422, 500})
    void reportReadFailuresAreUnavailable(int code) {
        status = code;

        assertEquals(HindsightClient.ReportResponse.UNAVAILABLE, client().patternReport(4));
    }

    @Test
    void reportReadSurvivesBadResponsesSlownessAndOutages() {
        body = "{\"report\": [";
        assertEquals(HindsightClient.ReportResponse.UNAVAILABLE, client().patternReport(4));
        assertEquals(HindsightClient.ReportResponse.UNAVAILABLE, new HindsightClient("", TOKEN, clock).patternReport(4));

        body = "{\"report\": null}";
        delayMillis = 5_000;
        long started = System.nanoTime();
        assertEquals(HindsightClient.ReportResponse.UNAVAILABLE, client().patternReport(4));
        assertTrue(Duration.ofNanos(System.nanoTime() - started).toMillis() < 4_000, "read timeout should cut it off");

        var client = client();
        server.stop(0);
        assertEquals(HindsightClient.ReportResponse.UNAVAILABLE, client.patternReport(4));
    }

    @Test
    void reportReadsShareTheBreakerWithPageReads() {
        var client = client();
        status = 500;
        for (int i = 0; i < HindsightClient.BREAKER_FAILURES; i++) {
            if (i % 2 == 0) client.listBehaviorReports(4, null, 10);
            else client.getBehaviorReport(4, LocalDate.of(2026, 10, 28));
        }

        status = 200;
        body = "{\"report\": null}";
        client.insights(4, List.of(7));
        client.patternReport(4);
        assertEquals(HindsightClient.ReportListResponse.UNAVAILABLE, client.listBehaviorReports(4, null, 10));
        assertEquals(HindsightClient.BehaviorReportResponse.UNAVAILABLE, client.getBehaviorReport(4, LocalDate.of(2026, 10, 28)));
        assertEquals(HindsightClient.BREAKER_FAILURES, requests.size(), "paused calls never reach hindsight");
    }

    @Test
    void postsTheFactsWithTheContractFieldNames() throws Exception {
        body = BEHAVIOR_REPORT;

        var response = client().createBehaviorReport(4, FACTS);

        assertEquals(List.of("/v1/users/4/behavior-reports?null"), requests);
        assertEquals(List.of("null"), upgrades);
        assertTrue(bodies.get(0).startsWith("POST "));
        var sent = new ObjectMapper().readTree(bodies.get(0).substring("POST ".length()));
        assertEquals(List.of("asOf", "portfolioValue", "trades", "holdingPeriods", "holdings", "autoEntryIds", "feedback",
                "behaviorNotes"), fieldNames(sent));
        assertEquals("2026-10-27", sent.get("asOf").asText());
        var trade = sent.get("trades").get(0);
        assertEquals(List.of("tradeId", "ticker", "side", "shares", "price", "timestamp", "initial", "runUp", "runUpStatus",
                "weightAtBuy", "outcomePrice", "outcomeKind", "outcomeOn"), fieldNames(trade));
        assertEquals("2026-03-03T15:00:00Z", trade.get("timestamp").asText());
        assertEquals("2026-10-27", trade.get("outcomeOn").asText());
        var period = sent.get("holdingPeriods").get(0);
        assertEquals(List.of("ticker", "openedAt", "closedAt", "cost", "pnl"), fieldNames(period));
        assertEquals("2026-03-03T15:00:00Z", period.get("openedAt").asText());
        assertTrue(period.get("closedAt").isNull(), "an open period sends closedAt as null, not absent");
        assertEquals(3, sent.get("autoEntryIds").get(0).asInt());

        assertEquals(new HindsightClient.BehaviorReportResponse(HindsightClient.ReportStatus.READY, PARSED_BEHAVIOR_REPORT),
                response);
    }

    @ParameterizedTest
    @ValueSource(ints = {401, 404, 422, 500, 503})
    void reportGenerationFailuresAreUnavailable(int code) {
        status = code;
        body = "{\"detail\": \"AI is off\"}";

        assertEquals(HindsightClient.ReportResponse.UNAVAILABLE, client().createPatternReport(4, FACTS));
    }

    @Test
    void reportGenerationSurvivesBadResponsesAndOutages() {
        body = "{\"patterns\": [";
        assertEquals(HindsightClient.ReportResponse.UNAVAILABLE, client().createPatternReport(4, FACTS));
        assertEquals(HindsightClient.ReportResponse.UNAVAILABLE,
                new HindsightClient("", TOKEN, clock).createPatternReport(4, FACTS));

        var client = client();
        server.stop(0);
        assertEquals(HindsightClient.ReportResponse.UNAVAILABLE, client.createPatternReport(4, FACTS));
    }

    @Test
    void reportGenerationWaitsForTheModelAndIgnoresTheBreaker() {
        var client = client();
        status = 500;
        for (int i = 0; i < HindsightClient.BREAKER_FAILURES; i++) client.listBehaviorReports(4, null, 10);

        status = 200;
        body = BEHAVIOR_REPORT;
        delayMillis = 3_000;
        assertEquals(HindsightClient.ReportStatus.READY, client.createBehaviorReport(4, FACTS).status(),
                "a paused breaker doesn't stop a POST, and the POST outlasts the page read timeout");

        clock.advance(HindsightClient.BREAKER_PAUSE.plusSeconds(1));
        delayMillis = 0;
        status = 500;
        client.createBehaviorReport(4, FACTS);
        client.createBehaviorReport(4, FACTS);
        status = 200;
        body = "{\"insights\": []}";
        int before = requests.size();
        client.insights(4, List.of(7));
        assertEquals(before + 1, requests.size(), "generation failures never pause page reads");
    }

    private static final String BEHAVIOR_REPORT = """
            {"day": "2026-10-28", "generatedAt": "2026-10-28T14:10:02Z", "asOf": "2026-10-28",
             "entriesUpTo": "2026-10-28T13:58:00Z", "saved": true, "model": "added later",
             "behaviors": [{"kind": "run_up", "subject": null,
                            "figures": [{"key": "decisions", "value": 5, "unit": "count"}],
                            "previous": {"day": "2026-10-14", "figures": [{"key": "decisions", "value": 4, "unit": "count"}]},
                            "observation": "You bought after run-ups.", "question": "What were you waiting for?",
                            "citations": [{"entryId": 12, "quote": "it keeps climbing"}],
                            "tradeIds": [7, 19], "entryIds": [12, 20]},
                           {"kind": "new_kind", "subject": "NVDA", "figures": [], "previous": null, "observation": "o",
                            "question": "q", "citations": [], "tradeIds": [], "entryIds": [], "addedLater": true}],
             "needs": [{"kind": "price_action", "subject": null, "more": 2, "reason": "ENTRIES"}]}
            """;
    private static final HindsightClient.BehaviorReport PARSED_BEHAVIOR_REPORT = new HindsightClient.BehaviorReport(
            LocalDate.of(2026, 10, 28), Instant.parse("2026-10-28T14:10:02Z"), LocalDate.of(2026, 10, 28),
            Instant.parse("2026-10-28T13:58:00Z"), true,
            List.of(new HindsightClient.Behavior("run_up", null, List.of(new HindsightClient.Figure("decisions", 5, "count")),
                            new HindsightClient.Previous(LocalDate.of(2026, 10, 14),
                                    List.of(new HindsightClient.Figure("decisions", 4, "count"))),
                            "You bought after run-ups.", "What were you waiting for?",
                            List.of(new HindsightClient.Citation(12, "it keeps climbing")), List.of(7, 19), List.of(12, 20)),
                    new HindsightClient.Behavior("new_kind", "NVDA", List.of(), null, "o", "q", List.of(), List.of(), List.of())),
            List.of(new HindsightClient.Need("price_action", null, 2, "ENTRIES")));

    @Test
    void listsOlderReportsWithTheLastAttempt() {
        body = """
                {"reports": [{"day": "2026-10-28", "generatedAt": "2026-10-28T14:10:02Z",
                              "behaviors": [{"kind": "run_up", "subject": null,
                                             "figures": [{"key": "decisions", "value": 5, "unit": "count"}]}]}],
                 "hasOlder": true, "lastAttempt": {"day": "2026-10-29", "status": "FAILED", "at": "2026-10-29T15:00:00Z"}}
                """;

        var response = client().listBehaviorReports(4, LocalDate.of(2026, 10, 29), 10);

        assertEquals(List.of("/v1/users/4/behavior-reports?before=2026-10-29&limit=10"), requests);
        assertEquals("GET ", bodies.get(0));
        assertEquals(List.of("Bearer " + TOKEN), tokens);
        assertEquals(new HindsightClient.ReportListResponse(HindsightClient.ReportStatus.READY,
                new HindsightClient.BehaviorReportList(
                        List.of(new HindsightClient.ReportSummary(LocalDate.of(2026, 10, 28), Instant.parse("2026-10-28T14:10:02Z"),
                                List.of(new HindsightClient.BehaviorSummary("run_up", null,
                                        List.of(new HindsightClient.Figure("decisions", 5, "count")))))),
                        true,
                        new HindsightClient.Attempt(LocalDate.of(2026, 10, 29), HindsightClient.AttemptStatus.FAILED,
                                Instant.parse("2026-10-29T15:00:00Z")))),
                response);
    }

    @Test
    void listsTheFirstPageBeforeAnyAttempt() {
        body = "{\"reports\": [], \"hasOlder\": false, \"lastAttempt\": null}";

        var response = client().listBehaviorReports(4, null, 10);

        assertEquals(List.of("/v1/users/4/behavior-reports?limit=10"), requests);
        assertEquals(new HindsightClient.ReportListResponse(HindsightClient.ReportStatus.READY,
                new HindsightClient.BehaviorReportList(List.of(), false, null)), response);
    }

    @Test
    void readsADaysReportAndKeepsWhatItDoesNotKnow() {
        body = "{\"report\": " + BEHAVIOR_REPORT + "}";

        var response = client().getBehaviorReport(4, LocalDate.of(2026, 10, 28));

        assertEquals(List.of("/v1/users/4/behavior-reports/2026-10-28?null"), requests);
        assertEquals("GET ", bodies.get(0));
        assertEquals(List.of("Bearer " + TOKEN), tokens);
        assertEquals(new HindsightClient.BehaviorReportResponse(HindsightClient.ReportStatus.READY, PARSED_BEHAVIOR_REPORT),
                response);
    }

    @Test
    void noReportThatDayIsReadyAndEmpty() {
        body = "{\"report\": null}";

        assertEquals(new HindsightClient.BehaviorReportResponse(HindsightClient.ReportStatus.READY, null),
                client().getBehaviorReport(4, LocalDate.of(2026, 10, 28)));
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "409 | {\"code\": \"ATTEMPTED_TODAY\", \"detail\": \"Today's report failed.\"} | FAILED_TODAY",
            "409 | {\"code\": \"SOMETHING_ELSE\", \"detail\": \"d\"}                       | UNAVAILABLE",
            "409 | {\"detail\": \"no code\"}                                                 | UNAVAILABLE",
            "503 | {\"code\": \"AI_OFF\", \"detail\": \"AI is off\"}                           | UNAVAILABLE",
            "404 | {\"detail\": \"Not Found\"}                                               | UNAVAILABLE",
            "422 | {\"detail\": [{\"loc\": [\"body\", \"trades\"]}]}                           | UNAVAILABLE",
            "401 | {\"detail\": \"bad token\"}                                               | UNAVAILABLE"})
    void mapsReportGenerationErrors(int code, String problem, HindsightClient.ReportStatus expected) {
        status = code;
        body = problem;
        contentType = "application/problem+json";

        var response = client().createBehaviorReport(4, FACTS);

        assertEquals(expected, response.status());
        assertNull(response.report());
    }

    @Test
    void behaviorReportGenerationSurvivesBadResponsesAndOutages() {
        body = "{\"behaviors\": [";
        assertEquals(HindsightClient.BehaviorReportResponse.UNAVAILABLE, client().createBehaviorReport(4, FACTS));

        var client = client();
        server.stop(0);
        assertEquals(HindsightClient.BehaviorReportResponse.UNAVAILABLE, client.createBehaviorReport(4, FACTS));
    }

    private static List<String> fieldNames(com.fasterxml.jackson.databind.JsonNode node) {
        var names = new java.util.ArrayList<String>();
        node.fieldNames().forEachRemaining(names::add);
        return names;
    }

    static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-10-25T12:00:00Z");

        void advance(Duration duration) { now = now.plus(duration); }

        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(now, zone); }
        @Override public Instant instant() { return now; }
    }
}
