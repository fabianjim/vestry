package me.vestry.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import me.vestry.model.Stock;
import me.vestry.model.Stock.StockType;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import me.vestry.exception.PriceFetchException;
import me.vestry.exception.UnknownTickerException;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

@Component
public class TiingoClient implements MarketDataClient {

    @Value("${tiingo.api.token}")
    private String apiToken;

    private static final Pattern TICKER_FORMAT = Pattern.compile("[A-Z0-9][A-Z0-9.-]*");
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final String baseUrl = "https://api.tiingo.com";
    private final RestTemplate restTemplate = new RestTemplate();
    private final RestTemplate batchRestTemplate;

    public TiingoClient() {
        // Bound scheduled network work without changing the immediate trade-fetch path.
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(15_000);
        batchRestTemplate = new RestTemplate(factory);
    }

    private HttpHeaders createAuthHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("Authorization", "Token " + apiToken);
        return headers;
    }


    @Override
    public Stock getStockData(String ticker, StockType type) {
        String url = baseUrl + "/iex/" + ticker;
        HttpEntity<String> entity = new HttpEntity<>(createAuthHeaders());

        try {
            ResponseEntity<String> response = restTemplate.exchange(
                    url, HttpMethod.GET, entity, String.class
            );
            String json = response.getBody();
            return parseStockData(json, ticker, type);
        } catch (UnknownTickerException e) {
            throw e;  // Propagate untouched — don't retry unknown tickers
        } catch (Exception e) {
            throw new PriceFetchException(ticker, e.getMessage(), e);
        }
    }

    public Stock parseStockData(String json, String ticker, StockType type) {
        try {
            JsonNode root = objectMapper.readTree(json);
            if (root.isArray() && !root.isEmpty()) {
                JsonNode stockNode = root.get(0);

                return parseStockNode(stockNode, ticker, type);
            }
            else {
                throw new UnknownTickerException(ticker);
            }

        } catch (JsonProcessingException e) {
            throw new PriceFetchException(ticker, "Error parsing JSON response", e);
        }
    }

    private Stock parseStockNode(JsonNode stockNode, String ticker, StockType type) {
        String apiTimestamp = stockNode.get("timestamp").asText();
        Instant timestamp = OffsetDateTime.parse(apiTimestamp).toInstant();
        double currentPrice = stockNode.get("tngoLast").asDouble();
        double open = stockNode.get("open").asDouble();
        double prevClose = stockNode.get("prevClose").asDouble();
        double high = stockNode.get("high").asDouble();
        double low = stockNode.get("low").asDouble();

        // Calculate hour bucket
        Instant hourBucket;
        if (type == StockType.EOD) {
            // Preserve the existing EOD bucket at 16:00 UTC; this is not market-close conversion.
            hourBucket = timestamp.truncatedTo(ChronoUnit.DAYS)
                    .plus(16, ChronoUnit.HOURS);
        } else if (type == StockType.INITIAL) {
            // INITIAL stock data uses exact timestamp (not rounded)
            // so portfolio creation shows the correct time/value on the graph
            hourBucket = timestamp;
        } else {
            // Round to nearest hour for INTRADAY
            long epochSeconds = timestamp.getEpochSecond();
            long hourInSeconds = 3600;
            long roundedSeconds = Math.round((double) epochSeconds / hourInSeconds) * hourInSeconds;
            hourBucket = Instant.ofEpochSecond(roundedSeconds);
        }

        return new Stock(ticker, timestamp, currentPrice, open, prevClose, high, low, type, hourBucket);
    }

    @Override
    public BatchStockResult getStockDataBatch(List<String> tickers, StockType type) {
        Map<String, String> failures = new LinkedHashMap<>();
        Map<String, List<String>> requested = prepareBatchTickers(tickers, failures);
        if (requested.isEmpty()) {
            return new BatchStockResult(Map.of(), failures, false);
        }

        String symbols = String.join(",", requested.keySet());
        ResponseEntity<String> response = batchRestTemplate.exchange(
                baseUrl + "/iex/" + symbols, HttpMethod.GET,
                new HttpEntity<>(createAuthHeaders()), String.class);
        JsonNode observations = readBatchResponse(response.getBody(), symbols);
        return parseBatchObservations(observations, requested, failures, type);
    }

    private Map<String, List<String>> prepareBatchTickers(List<String> tickers, Map<String, String> failures) {
        // Normalize only the wire symbol. Preserve original database identities in the result.
        Map<String, List<String>> requested = new LinkedHashMap<>();
        for (String ticker : new LinkedHashSet<>(tickers)) {
            String symbol = ticker.trim().toUpperCase(Locale.ROOT);
            if (!TICKER_FORMAT.matcher(symbol).matches()) {
                failures.put(ticker, "Invalid ticker format");
                continue;
            }
            requested.computeIfAbsent(symbol, ignored -> new ArrayList<>()).add(ticker);
        }
        return requested;
    }

    private JsonNode readBatchResponse(String json, String symbols) {
        JsonNode root;
        try {
            root = objectMapper.readTree(json == null ? "" : json);
        } catch (JsonProcessingException e) {
            throw new PriceFetchException(symbols, "Invalid batch JSON response", e);
        }
        if (root == null || !root.isArray()) {
            throw new PriceFetchException(symbols, "Expected a batch response array");
        }
        return root;
    }

    private BatchStockResult parseBatchObservations(JsonNode observations, Map<String, List<String>> requested,
                                                    Map<String, String> failures, StockType type) {
        Map<String, JsonNode> bySymbol = new LinkedHashMap<>();
        Set<String> duplicates = new HashSet<>();
        for (JsonNode observation : observations) {
            String symbol = observation.path("ticker").asText("").trim().toUpperCase(Locale.ROOT);
            if (!requested.containsKey(symbol)) continue; // Never ingest unsolicited symbols.
            if (bySymbol.putIfAbsent(symbol, observation) != null) duplicates.add(symbol);
        }

        Map<String, Stock> stocks = new LinkedHashMap<>();
        for (var request : requested.entrySet()) {
            String symbol = request.getKey();
            JsonNode observation = bySymbol.get(symbol);
            for (String ticker : request.getValue()) {
                if (duplicates.contains(symbol)) {
                    failures.put(ticker, "Duplicate observation in batch response");
                } else if (observation == null) {
                    failures.put(ticker, "No observation returned");
                } else {
                    try {
                        validateBatchObservation(observation);
                        stocks.put(ticker, parseStockNode(observation, ticker, type));
                    } catch (IllegalArgumentException | java.time.DateTimeException e) {
                        failures.put(ticker, "Invalid observation: " + e.getMessage());
                    }
                }
            }
        }
        return new BatchStockResult(stocks, failures, true);
    }

    private void validateBatchObservation(JsonNode node) {
        if (!node.path("timestamp").isTextual()) {
            throw new IllegalArgumentException("Missing timestamp");
        }
        for (String field : List.of("tngoLast", "open", "prevClose", "high", "low")) {
            JsonNode value = node.path(field);
            if (!value.isNumber() || !Double.isFinite(value.asDouble()) || value.asDouble() <= 0) {
                throw new IllegalArgumentException("Invalid " + field);
            }
        }
    }

    // Old method
    @Override
    public double getCurrentPrice(String ticker) {
        String url = baseUrl + "/iex/" + ticker;
        HttpEntity<String> entity = new HttpEntity<>(createAuthHeaders());

        try {
            ResponseEntity<String> response = restTemplate.exchange(
                    url, HttpMethod.GET, entity, String.class
            );
            String json = response.getBody();
            JsonNode root = objectMapper.readTree(json);
            if (root.isArray() && !root.isEmpty()) {
                return root.get(0).get("tngoLast").asDouble();
            } else {
                throw new UnknownTickerException(ticker);
            }
        } catch (UnknownTickerException e) {
            throw e;
        } catch (Exception e) {
            throw new PriceFetchException(ticker, e.getMessage(), e);
        }
    }

    @Override
    public String testConnection() {
        String url = baseUrl + "/api/test/";
        HttpEntity<String> entity = new HttpEntity<>(createAuthHeaders());

        ResponseEntity<String> response = restTemplate.exchange(
                url, HttpMethod.GET, entity, String.class
        );

        return response.getBody();
    }


}
