package me.vestry.service;

import me.vestry.api.TiingoClient;
import me.vestry.model.Stock.StockType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.io.IOException;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class TiingoBatchTest {
    private TiingoClient client;
    private MockRestServiceServer server;

    @BeforeEach
    void setUp() {
        client = new TiingoClient();
        ReflectionTestUtils.setField(client, "apiToken", "test-token");
        server = MockRestServiceServer.bindTo((RestTemplate)
                ReflectionTestUtils.getField(client, "batchRestTemplate")).build();
    }

    private String quote(String ticker) {
        return "{\"ticker\":\"" + ticker + "\",\"timestamp\":\"2026-09-09T14:00:01Z\","
                + "\"tngoLast\":200,\"open\":195,\"prevClose\":190,\"high\":201,\"low\":194}";
    }

    @Test
    void oneRequestMapsReorderedSymbolsAndPreservesDatabaseIdentity() {
        server.expect(requestTo("https://api.tiingo.com/iex/AAPL,NVDA,MSFT"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("Authorization", "Token test-token"))
                .andRespond(withSuccess("[" + quote("NVDA") + "," + quote("aapl") + "," + quote("MSFT") + "]", MediaType.APPLICATION_JSON));
        var result = client.getStockDataBatch(List.of("aapl", "NVDA", "MSFT", "aapl"), StockType.INTRADAY);
        assertTrue(result.requestAttempted());
        assertEquals(3, result.stocks().size());
        assertTrue(result.failures().isEmpty());
        assertEquals("aapl", result.stocks().get("aapl").getTicker());
        assertEquals(Instant.parse("2026-09-09T14:00:01Z"), result.stocks().get("aapl").getTimestamp());
        assertEquals(Instant.parse("2026-09-09T14:00:00Z"), result.stocks().get("aapl").getHourBucket());
        server.verify();
    }

    @Test
    void omissionsNullsAndDuplicateRowsFailOnlyAffectedSymbols() {
        server.expect(requestTo("https://api.tiingo.com/iex/AAPL,NVDA,MSFT,TSLA"))
                .andRespond(withSuccess("[" + quote("AAPL") + ","
                        + quote("NVDA").replace("\"tngoLast\":200", "\"tngoLast\":null") + ","
                        + quote("MSFT") + "," + quote("MSFT") + "," + quote("UNREQUESTED") + "]", MediaType.APPLICATION_JSON));
        var result = client.getStockDataBatch(List.of("AAPL", "NVDA", "MSFT", "TSLA"), StockType.EOD);
        assertEquals(1, result.stocks().size());
        assertEquals(3, result.failures().size());
        assertTrue(result.failures().get("TSLA").contains("No observation"));
        assertEquals(StockType.EOD, result.stocks().get("AAPL").getType());
        server.verify();
    }

    @Test
    void emptyInputMakesNoRequest() {
        var result = client.getStockDataBatch(List.of(), StockType.INTRADAY);
        assertTrue(result.stocks().isEmpty());
        assertFalse(result.requestAttempted());
        server.verify();
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "null", "not json", ""})
    void malformedResponseIsAWholeRequestFailure(String response) {
        server.expect(anything()).andRespond(withSuccess(response, MediaType.APPLICATION_JSON));
        assertThrows(RuntimeException.class, () -> client.getStockDataBatch(List.of("AAPL"), StockType.INTRADAY));
        server.verify();
    }

    @ParameterizedTest
    @ValueSource(ints = {401, 403, 429, 500, 503})
    void httpFailuresAreNotRetried(int status) {
        server.expect(anything()).andRespond(withStatus(HttpStatus.valueOf(status)));
        assertThrows(RuntimeException.class, () -> client.getStockDataBatch(List.of("AAPL"), StockType.INTRADAY));
        server.verify();
    }

    @Test
    void networkFailureIsNotRetried() {
        server.expect(anything()).andRespond(withException(new IOException("timeout")));
        assertThrows(RuntimeException.class, () -> client.getStockDataBatch(List.of("AAPL"), StockType.INTRADAY));
        server.verify();
    }

    @Test
    void emptyResponseMarksEveryRequestedTickerFailed() {
        server.expect(anything()).andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));
        var result = client.getStockDataBatch(List.of("AAPL", "MSFT"), StockType.INTRADAY);
        assertTrue(result.stocks().isEmpty());
        assertEquals(2, result.failures().size());
        server.verify();
    }

    @Test
    void caseVariantsShareOneWireSymbolButRetainBothDatabaseIdentities() {
        server.expect(requestTo("https://api.tiingo.com/iex/AAPL"))
                .andRespond(withSuccess("[" + quote("aapl") + "]", MediaType.APPLICATION_JSON));
        var result = client.getStockDataBatch(List.of("aapl", "AAPL"), StockType.INTRADAY);
        assertEquals("aapl", result.stocks().get("aapl").getTicker());
        assertEquals("AAPL", result.stocks().get("AAPL").getTicker());
        server.verify();
    }

    @ParameterizedTest
    @ValueSource(strings = {"null", "0", "-1", "\"bad\"", "1e400"})
    void invalidPricesNeverBecomeSavedZerosOrNonFiniteNumbers(String price) {
        server.expect(anything()).andRespond(withSuccess("["
                + quote("AAPL").replace("\"tngoLast\":200", "\"tngoLast\":" + price) + "]", MediaType.APPLICATION_JSON));
        var result = client.getStockDataBatch(List.of("AAPL"), StockType.INTRADAY);
        assertTrue(result.stocks().isEmpty());
        assertTrue(result.failures().containsKey("AAPL"));
        server.verify();
    }

    @Test
    void perTickerTimestampsArePreservedAndBadTimestampIsIsolated() {
        server.expect(anything()).andRespond(withSuccess("[" + quote("AAPL") + ","
                + quote("MSFT").replace("14:00:01", "14:00:07") + ","
                + quote("NVDA").replace("2026-09-09T14:00:01Z", "invalid") + "]", MediaType.APPLICATION_JSON));
        var result = client.getStockDataBatch(List.of("AAPL", "MSFT", "NVDA"), StockType.INTRADAY);
        assertEquals(Instant.parse("2026-09-09T14:00:01Z"), result.stocks().get("AAPL").getTimestamp());
        assertEquals(Instant.parse("2026-09-09T14:00:07Z"), result.stocks().get("MSFT").getTimestamp());
        assertTrue(result.failures().containsKey("NVDA"));
        server.verify();
    }
    @Test
    void malformedInputDoesNotPreventValidSymbolsFromBeingFetched() {
        server.expect(requestTo("https://api.tiingo.com/iex/AAPL,MSFT"))
                .andRespond(withSuccess("[" + quote("AAPL") + "," + quote("MSFT") + "]", MediaType.APPLICATION_JSON));
        var result = client.getStockDataBatch(List.of("AAPL", "BAD/TICKER", "MSFT"), StockType.INTRADAY);
        assertEquals(2, result.stocks().size());
        assertEquals(1, result.failures().size());
        assertTrue(result.failures().containsKey("BAD/TICKER"));
        server.verify();
    }

    @Test
    void allMalformedSymbolsReturnFailuresWithoutAnHttpRequest() {
        var result = client.getStockDataBatch(List.of("BAD/TICKER", " "), StockType.INTRADAY);
        assertTrue(result.stocks().isEmpty());
        assertEquals(2, result.failures().size());
        assertFalse(result.requestAttempted());
        server.verify();
    }

}
