package com.github.fabianjim.portfoliomonitor.controller;

import com.github.fabianjim.portfoliomonitor.dto.StockDataDTO;
import com.github.fabianjim.portfoliomonitor.model.Portfolio;
import com.github.fabianjim.portfoliomonitor.model.Stock;
import com.github.fabianjim.portfoliomonitor.model.Stock.StockType;
import com.github.fabianjim.portfoliomonitor.model.TrackedStock;
import com.github.fabianjim.portfoliomonitor.repository.TrackedStockRepository;
import com.github.fabianjim.portfoliomonitor.service.PortfolioService;
import com.github.fabianjim.portfoliomonitor.service.StockService;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/stock")
public class StockController {

    private final StockService stockService;
    private final PortfolioService portfolioService;
    private final TrackedStockRepository trackedStockRepository;

    public StockController(StockService stockService, PortfolioService portfolioService,
                          TrackedStockRepository trackedStockRepository) {
        this.stockService = stockService;
        this.portfolioService = portfolioService;
        this.trackedStockRepository = trackedStockRepository;
    }

    // initial manual fetch from the frontend before routine fetches
    @GetMapping("/fetch/initial")
    public List<Stock> fectchInitialStocks() {
        Portfolio portfolio = portfolioService.getPortfolio();
        List<String> tickers = portfolioService.getTickersfromPortfolio(portfolio);
        return stockService.updateMultipleStocks(tickers, StockType.INITIAL);
    }

    // Get latest stock data with stale warning
    @GetMapping("/data/{ticker}")
    public StockDataDTO getStockData(@PathVariable String ticker) {
        Optional<Stock> stockOpt = stockService.getLatestStockData(ticker);
        Optional<TrackedStock> trackedOpt = trackedStockRepository.findByTicker(ticker);

        if (stockOpt.isEmpty()) {
            return new StockDataDTO(null, true, "No data available for this stock", null);
        }

        Stock stock = stockOpt.get();

        if (trackedOpt.isPresent()) {
            TrackedStock tracked = trackedOpt.get();
            boolean isStale = tracked.isStale();
            String warning = isStale ? "Data is stale" : null;
            return new StockDataDTO(stock, isStale, warning, tracked.getLastSuccessfulFetch());
        }

        // If not tracked but has data, it's likely orphaned data
        return new StockDataDTO(stock, true, "Stock is not currently being tracked", null);
    }

    // Get historical data for a ticker from a specific timestamp
    @GetMapping("/history/{ticker}")
    public List<Stock> getHistoricalData(@PathVariable String ticker, @RequestParam(required = false) Instant from) {
        List<Stock> allData = stockService.getHistoricalStockData(ticker);

        if (from != null) {
            // Filter data from the specified timestamp onwards
            return allData.stream()
                .filter(s -> !s.getTimestamp().isBefore(from))
                .toList();
        }

        return allData;
    }

}
