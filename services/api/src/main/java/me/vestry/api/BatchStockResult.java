package me.vestry.api;

import me.vestry.model.Stock;

import java.util.Map;

/**
 * Results keyed by the original requested ticker, including omitted or invalid observations.
 * requestAttempted distinguishes local validation failures from an HTTP request.
 */
public record BatchStockResult(Map<String, Stock> stocks, Map<String, String> failures, boolean requestAttempted) {
    public BatchStockResult {
        stocks = Map.copyOf(stocks);
        failures = Map.copyOf(failures);
        if (stocks.keySet().stream().anyMatch(failures::containsKey)) {
            throw new IllegalArgumentException("A ticker cannot both succeed and fail");
        }
    }
}
