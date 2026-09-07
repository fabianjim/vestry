package me.vestry.service;

import me.vestry.api.MarketDataClient;
import me.vestry.model.Stock;
import me.vestry.model.Stock.StockType;
import me.vestry.repository.StockRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
@Transactional
public class StockService {

    private final MarketDataClient marketDataClient;
    private final StockRepository stockRepository;

    public StockService(MarketDataClient marketDataClient, StockRepository stockRepository) {
        this.marketDataClient = marketDataClient;
        this.stockRepository = stockRepository;
    }

    public Optional<Stock> getLatestStockData(String ticker) {
        return stockRepository.findFirstByTickerOrderByTimestampDesc(ticker);
    }

    public Optional<Stock> getStockData(String ticker, Instant timestamp) {
        return stockRepository.findByTickerAndTimestamp(ticker, timestamp);
    }

    public List<Stock> getHistoricalStockData(String ticker) {
        return stockRepository.findByTickerOrderByTimestampDesc(ticker);
    }

    public Stock updateStockData(String ticker, StockType type) {
        Stock freshData = marketDataClient.getStockData(ticker, type);

        // Check if data already exists for this ticker/timestamp combination
        Optional<Stock> existingData = stockRepository.findByTickerAndTimestamp(
            ticker, freshData.getTimestamp()
        );

        if (existingData.isPresent()) {
            // Data already exists, return existing data
            System.out.println("Stock data already exists for " + ticker + " at " + freshData.getTimestamp() + ", skipping duplicate insert");
            return existingData.get();
        }

        return stockRepository.save(freshData);
    }

    public List<Stock> updateMultipleStocks(List<String> tickers, StockType type) {
        List<Stock> updatedStocks = new ArrayList<>();
        for (String ticker : tickers) {
            try {
                Stock updatedStock = updateStockData(ticker, type);
                updatedStocks.add(updatedStock);
            } catch (Exception e) {
                System.err.println("Failed to update stock data for " + ticker + ": " + e.getMessage());
            }
        }
        return updatedStocks;
    }

    public boolean hasStockData(String ticker) {
        return stockRepository.existsByTicker(ticker);
    }
}
