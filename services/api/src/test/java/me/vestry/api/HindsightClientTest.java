package me.vestry.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
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
    private final MutableClock clock = new MutableClock();
    private volatile int status = 200;
    private volatile String body = "{\"insights\": []}";
    private volatile long delayMillis = 0;

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            requests.add(exchange.getRequestURI().getRawPath() + "?" + exchange.getRequestURI().getRawQuery());
            tokens.add(exchange.getRequestHeaders().getFirst("Authorization"));
            bodies.add(exchange.getRequestMethod() + " " + new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            try {
                Thread.sleep(delayMillis);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
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

    static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-10-25T12:00:00Z");

        void advance(Duration duration) { now = now.plus(duration); }

        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(now, zone); }
        @Override public Instant instant() { return now; }
    }
}
