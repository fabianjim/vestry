package com.github.fabianjim.portfoliomonitor.api;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.fabianjim.portfoliomonitor.model.Stock;
import com.github.fabianjim.portfoliomonitor.model.Stock.StockType;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

@Component
public class TiingoClient implements MarketDataClient {

    @Value("${tiingo.api.token}")
    private String apiToken;

    private final String baseUrl = "https://api.tiingo.com";
    private final RestTemplate restTemplate = new RestTemplate();

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

        ResponseEntity<String> response = restTemplate.exchange(
                url, HttpMethod.GET, entity, String.class
        );
        String json = response.getBody();
        return parseStockData(json, ticker, type);
    }

    public Stock parseStockData(String json, String ticker, StockType type) {
        ObjectMapper objectMapper = new ObjectMapper();
        try {
            JsonNode root = objectMapper.readTree(json);
            if (root.isArray() && !root.isEmpty()) {
                JsonNode stockNode = root.get(0);

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
                    // EOD data always goes to 4:00 PM
                    hourBucket = timestamp.truncatedTo(ChronoUnit.DAYS)
                            .plus(16, ChronoUnit.HOURS);
                } else {
                    // Round to nearest hour for INTRADAY and INITIAL
                    long epochSeconds = timestamp.getEpochSecond();
                    long hourInSeconds = 3600;
                    long roundedSeconds = Math.round((double) epochSeconds / hourInSeconds) * hourInSeconds;
                    hourBucket = Instant.ofEpochSecond(roundedSeconds);
                }

                return new Stock(ticker, timestamp, currentPrice, open, prevClose, high, low, type, hourBucket);
            }
            else {
                throw new RuntimeException("Invalid JSON data format for: " + ticker);
            }

        } catch (JsonProcessingException e) {
            throw new RuntimeException("Error parsing JSON for ticker: " + ticker, e);
        }
    }

    // Old method
    @Override
    public double getCurrentPrice(String ticker) {
        String url = baseUrl + "/iex/" + ticker;
        HttpEntity<String> entity = new HttpEntity<>(createAuthHeaders());

        ResponseEntity<String> response = restTemplate.exchange(
                url, HttpMethod.GET, entity, String.class
        );
        String json = response.getBody();
        ObjectMapper objectMapper = new ObjectMapper();
        try {
            JsonNode root = objectMapper.readTree(json);
            if (root.isArray() && !root.isEmpty()) {
                return root.get(0).get("tngoLast").asDouble();
            } else {
                throw new RuntimeException("Empty response or invalid JSON format for: " + ticker);
            }
        } catch (Exception e) {
            throw new RuntimeException("Error parsing JSON: " + e.getMessage(), e);
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

