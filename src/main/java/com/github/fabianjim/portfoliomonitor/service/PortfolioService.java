package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.dto.PnLSummaryDTO;
import com.github.fabianjim.portfoliomonitor.dto.PortfolioHistoryDTO;
import com.github.fabianjim.portfoliomonitor.exception.PriceFetchException;
import com.github.fabianjim.portfoliomonitor.exception.UnknownTickerException;
import com.github.fabianjim.portfoliomonitor.model.Holding;
import com.github.fabianjim.portfoliomonitor.model.Portfolio;
import com.github.fabianjim.portfoliomonitor.model.Stock;
import com.github.fabianjim.portfoliomonitor.model.TrackedStock;
import com.github.fabianjim.portfoliomonitor.model.Transaction;
import com.github.fabianjim.portfoliomonitor.model.User;
import com.github.fabianjim.portfoliomonitor.repository.PortfolioRepository;
import com.github.fabianjim.portfoliomonitor.repository.StockRepository;
import com.github.fabianjim.portfoliomonitor.repository.TrackedStockRepository;
import com.github.fabianjim.portfoliomonitor.repository.UserRepository;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Service
@Transactional
public class PortfolioService {

    private final PortfolioRepository portfolioRepository;
    private final StockService stockService;
    private final UserRepository userRepository;
    private final TrackedStockRepository trackedStockRepository;
    private final StockRepository stockRepository;
    private final TransactionService transactionService;

    public PortfolioService(PortfolioRepository portfolioRepository,
                          StockService stockService,
                          UserRepository userRepository,
                          TrackedStockRepository trackedStockRepository,
                          StockRepository stockRepository,
                          TransactionService transactionService) {
        this.portfolioRepository = portfolioRepository;
        this.stockService = stockService;
        this.userRepository = userRepository;
        this.trackedStockRepository = trackedStockRepository;
        this.stockRepository = stockRepository;
        this.transactionService = transactionService;
    }

    private Integer getCurrentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            throw new RuntimeException("No authenticated user found");
        }
        User user = (User) auth.getPrincipal();
        return user.getId();
    }

    public void createPortfolio(Portfolio portfolio) {
        Integer userId = getCurrentUserId();

        User user = userRepository.findById(userId)
            .orElseThrow(() -> new RuntimeException("User not found with ID: " + userId));
        portfolio.setUser(user);

        if (portfolio != null && portfolio.getHoldings() != null) {
            // Aggregate any duplicate tickers in initial holdings
            List<Holding> aggregatedHoldings = new ArrayList<>();
            Map<String, Holding> holdingsByTicker = new HashMap<>();
            for (Holding holding : portfolio.getHoldings()) {
                Holding existing = holdingsByTicker.get(holding.getTicker());
                if (existing != null) {
                    existing.setShares(existing.getShares() + holding.getShares());
                } else {
                    Holding newHolding = new Holding(holding.getTicker(), holding.getShares());
                    holdingsByTicker.put(holding.getTicker(), newHolding);
                    aggregatedHoldings.add(newHolding);
                }
            }
            portfolio.setHoldings(aggregatedHoldings);

            // Validate all tickers by fetching prices before saving
            Map<String, Double> tickerPrices = new HashMap<>();
            for (Holding holding : portfolio.getHoldings()) {
                double price = fetchTransactionPrice(holding.getTicker());
                tickerPrices.put(holding.getTicker(), price);
                startTrackingStock(holding.getTicker());
            }

            portfolioRepository.save(portfolio);

            // Record buy transactions with validated prices (mark as initial portfolio creation)
            for (Holding holding : portfolio.getHoldings()) {
                double price = tickerPrices.get(holding.getTicker());
                transactionService.recordBuyTransaction(holding.getTicker(), holding.getShares(), price, null, true);
            }
        }
    }

    // Start tracking a stock ticker. If already tracked, increment holder count
    private void startTrackingStock(String ticker) {
        TrackedStock trackedStock = trackedStockRepository.findByTicker(ticker)
            .orElse(null);

        if (trackedStock == null) {
            trackedStock = new TrackedStock(ticker);
            trackedStockRepository.save(trackedStock);
        } else {
            trackedStock.incrementHolderCount();
            trackedStockRepository.save(trackedStock);
        }
    }

    // Stop tracking a stock ticker. Decrement holder count, delete if no holders remain.
    private void stopTrackingStock(String ticker) {
        TrackedStock trackedStock = trackedStockRepository.findByTicker(ticker)
            .orElse(null);

        if (trackedStock != null) {
            trackedStock.decrementHolderCount();
            if (trackedStock.getHolderCount() <= 0) {
                trackedStockRepository.delete(trackedStock);
            } else {
                trackedStockRepository.save(trackedStock);
            }
        }
    }

     
    // Fetch live price for a transaction with one retry on fetch failures.
    private double fetchTransactionPrice(String ticker) {
        Exception lastError = null;
        for (int attempt = 1; attempt <= 2; attempt++) {
            try {
                Stock stock = stockService.updateStockData(ticker, Stock.StockType.INITIAL);
                if (stock != null && stock.getCurrentPrice() > 0.0) {
                    return stock.getCurrentPrice();
                }
                if (stock == null) {
                    lastError = new PriceFetchException(ticker, "No stock data returned");
                } else {
                    lastError = new PriceFetchException(ticker, "Invalid price (" + stock.getCurrentPrice() + ")");
                }
            } catch (UnknownTickerException e) {
                // no retry for unknown tickers saves a api call
                throw e;
            } catch (Exception e) {
                lastError = e;
            }
                // retry once after 500ms 
            if (attempt == 1) {
                try {
                    TimeUnit.MILLISECONDS.sleep(500);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new PriceFetchException(ticker, "Retry interrupted", ie);
                }
            }
        }
        
        throw new PriceFetchException(ticker, lastError.getMessage(), lastError);
    }

    public void addHolding(String ticker, double shares) {
        addHolding(ticker, shares, null, null);
    }

    public void addHolding(String ticker, double shares, Double price, Instant timestamp) {
        Portfolio portfolio = getPortfolio();
        if (portfolio == null) {
            throw new RuntimeException("No portfolio found for current user");
        }

        // Fetch and validate price BEFORE modifying portfolio (unless manually provided)
        startTrackingStock(ticker);
        double currentPrice = (price != null && price > 0) ? price : fetchTransactionPrice(ticker);

        Holding existingHolding = portfolio.getHoldings().stream()
            .filter(h -> h.getTicker().equals(ticker))
            .findFirst()
            .orElse(null);

        if (existingHolding != null) {
            existingHolding.setShares(existingHolding.getShares() + shares);
        } else {
            Holding newHolding = new Holding(ticker, shares);
            portfolio.getHoldings().add(newHolding);
        }

        portfolioRepository.save(portfolio);

        // Record buy transaction with validated price
        transactionService.recordBuyTransaction(ticker, shares, currentPrice, timestamp);
    }

    public void removeHolding(String ticker) {
        removeHolding(ticker, null, null);
    }

    public void removeHolding(String ticker, Double price, Instant timestamp) {
        Portfolio portfolio = getPortfolio();
        if (portfolio == null) {
            throw new RuntimeException("No portfolio found for current user");
        }

        Holding holding = portfolio.getHoldings().stream()
            .filter(h -> h.getTicker().equals(ticker))
            .findFirst()
            .orElse(null);
        if (holding == null) {
            return;
        }
        double shares = holding.getShares();
        
        // Fetch and validate price BEFORE modifying portfolio (unless manually provided)
        double currentPrice = (price != null && price > 0) ? price : fetchTransactionPrice(ticker);
        portfolio.getHoldings().remove(holding);
        portfolioRepository.save(portfolio);

        // Stop tracking this stock
        stopTrackingStock(ticker);

        // Record sell transaction with validated price
        transactionService.recordSellTransaction(ticker, shares, currentPrice, timestamp);
    }

    // Sell a portion of a holding (partial sell).
    public void sellHolding(String ticker, double sharesToSell) {
        sellHolding(ticker, sharesToSell, null, null);
    }

    public void sellHolding(String ticker, double sharesToSell, Double price, Instant timestamp) {
        Portfolio portfolio = getPortfolio();
        if (portfolio == null) {
            throw new RuntimeException("No portfolio found for current user");
        }

        Holding holding = portfolio.getHoldings().stream()
            .filter(h -> h.getTicker().equals(ticker))
            .findFirst()
            .orElseThrow(() -> new RuntimeException("Holding not found for ticker: " + ticker));

        if (sharesToSell > holding.getShares()) {
            throw new RuntimeException("Cannot sell more shares than owned");
        }

        // Fetch and validate price BEFORE modifying portfolio (unless manually provided)
        double currentPrice = (price != null && price > 0) ? price : fetchTransactionPrice(ticker);

        // Record sell transaction with validated price
        transactionService.recordSellTransaction(ticker, sharesToSell, currentPrice, timestamp);

        // Update or remove holding
        if (sharesToSell == holding.getShares()) {
            // Selling all shares - remove the holding
            portfolio.getHoldings().remove(holding);
            stopTrackingStock(ticker);
        } else {
            // Partial sell, update shares
            holding.setShares(holding.getShares() - sharesToSell);
        }
        portfolioRepository.save(portfolio);
    }

    public List<String> getTickersfromPortfolio(Portfolio portfolio) {
        List<String> tickers = portfolio.getHoldings().stream()
                .map(Holding::getTicker)
                .distinct()
                .toList();
        return tickers;
    }



    public boolean existsByUserId() {
        Integer userId = getCurrentUserId();
        return portfolioRepository.existsByUserId(userId);
    }

    public Portfolio getPortfolio() {
        Integer userId = getCurrentUserId();
        return portfolioRepository.findByUserId(userId).orElse(null);
    }
    
    
    public Stock getStockData(String ticker) {
        return stockService.getLatestStockData(ticker).orElse(null);
    }

    public Stock getStockData(String ticker, Instant timestamp) {
        return stockService.getStockData(ticker, timestamp).orElse(null);
    }

    public List<TrackedStock> getTopTrendingStocks(int n) {
        return trackedStockRepository.findTopTrackedStocks(n);
    }

    /**
     * Calculate total, unrealized, and realized P/L for the current user's portfolio.
     * Uses average cost basis method per ticker.
     */
    public PnLSummaryDTO getPnLSummary() {
        List<Transaction> transactions = transactionService.getTransactionHistory();

        // Group transactions by ticker
        Map<String, List<Transaction>> byTicker = new HashMap<>();
        for (Transaction tx : transactions) {
            byTicker.computeIfAbsent(tx.getTicker(), k -> new ArrayList<>()).add(tx);
        }

        double totalUnrealized = 0;
        double totalRealized = 0;
        double totalCurrentCostBasis = 0;
        double totalSoldCostBasis = 0;

        for (List<Transaction> tickerTxs : byTicker.values()) {
            double buyShares = 0;
            double buyCost = 0;
            double sellShares = 0;
            double sellProceeds = 0;

            for (Transaction tx : tickerTxs) {
                if (tx.getType() == Transaction.TransactionType.BUY) {
                    buyShares += tx.getShares();
                    buyCost += tx.getTotalValue();
                } else {
                    sellShares += tx.getShares();
                    sellProceeds += tx.getTotalValue();
                }
            }

            if (buyShares == 0) continue;

            double avgCost = buyCost / buyShares;
            double realizedForTicker = sellProceeds - (avgCost * sellShares);
            totalRealized += realizedForTicker;
            totalSoldCostBasis += avgCost * sellShares;

            double currentShares = buyShares - sellShares;
            if (currentShares > 0) {
                String ticker = tickerTxs.get(0).getTicker();
                Stock stock = getStockData(ticker);
                double currentPrice = (stock != null) ? stock.getCurrentPrice() : 0;
                double unrealizedForTicker = (currentPrice - avgCost) * currentShares;
                totalUnrealized += unrealizedForTicker;
                totalCurrentCostBasis += avgCost * currentShares;
            }
        }

        double totalPnL = totalUnrealized + totalRealized;
        double totalCostBasis = totalCurrentCostBasis + totalSoldCostBasis;
        double totalPnLPercent = totalCostBasis > 0
                ? (totalPnL / totalCostBasis) * 100
                : 0;
        double unrealizedPercent = totalCurrentCostBasis > 0
                ? (totalUnrealized / totalCurrentCostBasis) * 100
                : 0;
        double realizedPercent = totalSoldCostBasis > 0
                ? (totalRealized / totalSoldCostBasis) * 100
                : 0;

        return new PnLSummaryDTO(totalPnL, totalPnLPercent,
                                 totalUnrealized, unrealizedPercent,
                                 totalRealized, realizedPercent);
    }

    /**
     * Calculate portfolio value history for the current user's portfolio.
     * Returns list of portfolio values grouped by hour bucket.
     * Uses the transaction ledger to determine actual shares owned at each point in time,
     * which correctly handles multiple purchases of the same ticker.
     */
    public List<PortfolioHistoryDTO> getPortfolioHistory() {
        Portfolio portfolio = getPortfolio();
        if (portfolio == null || portfolio.getHoldings() == null || portfolio.getHoldings().isEmpty()) {
            return new ArrayList<>();
        }

        List<Holding> holdings = portfolio.getHoldings();

        // Fetch all transactions to calculate shares-at-time accurately
        List<Transaction> transactions = transactionService.getTransactionHistory();
        Map<String, List<Transaction>> transactionsByTicker = new HashMap<>();
        for (Transaction tx : transactions) {
            transactionsByTicker
                .computeIfAbsent(tx.getTicker(), k -> new ArrayList<>())
                .add(tx);
        }

        // Map to store all stock data grouped by hour bucket
        Map<Instant, Map<String, Stock>> dataByHourBucket = new HashMap<>();

        // Fetch historical data for each holding
        for (Holding holding : holdings) {
            List<Stock> stockHistory = stockRepository.findByTickerOrderByTimestampDesc(holding.getTicker());

            for (Stock stock : stockHistory) {
                // Only include INTRADAY and INITIAL data, exclude EOD
                if (stock.getType() == Stock.StockType.EOD) {
                    continue;
                }

                // Only include data from first buy time onward
                if (!stock.getHourBucket().isBefore(holding.getBuyTimestamp())) {
                    dataByHourBucket
                        .computeIfAbsent(stock.getHourBucket(), k -> new HashMap<>())
                        .put(stock.getTicker(), stock);
                }
            }
        }

        // Calculate portfolio value at each hour bucket
        List<PortfolioHistoryDTO> result = new ArrayList<>();

        for (Map.Entry<Instant, Map<String, Stock>> entry : dataByHourBucket.entrySet()) {
            Instant hourBucket = entry.getKey();
            Map<String, Stock> stocksAtHour = entry.getValue();

            // Calculate actual shares owned for each ticker at this hour bucket
            // by summing all buy transactions and subtracting sell transactions
            // that occurred at or before this hour bucket
            Map<String, Double> sharesAtTime = new HashMap<>();
            for (Map.Entry<String, List<Transaction>> tickerTxs : transactionsByTicker.entrySet()) {
                String ticker = tickerTxs.getKey();
                double shares = 0;
                for (Transaction tx : tickerTxs.getValue()) {
                    if (!tx.getTimestamp().isAfter(hourBucket)) {
                        if (tx.getType() == Transaction.TransactionType.BUY) {
                            shares += tx.getShares();
                        } else {
                            shares -= tx.getShares();
                        }
                    }
                }
                if (shares > 0) {
                    sharesAtTime.put(ticker, shares);
                }
            }

            // Check if we have stock data for all tickers with shares > 0
            if (stocksAtHour.size() >= sharesAtTime.size()) {
                double totalValue = 0.0;
                boolean hasAllData = true;

                for (Map.Entry<String, Double> shareEntry : sharesAtTime.entrySet()) {
                    String ticker = shareEntry.getKey();
                    double shares = shareEntry.getValue();
                    Stock stock = stocksAtHour.get(ticker);

                    if (stock == null) {
                        hasAllData = false;
                        break;
                    }

                    totalValue += stock.getCurrentPrice() * shares;
                }

                if (hasAllData && !sharesAtTime.isEmpty()) {
                    result.add(new PortfolioHistoryDTO(hourBucket, totalValue));
                }
            }
        }
        // Sort, oldest first for chart display
        result.sort(Comparator.comparing(PortfolioHistoryDTO::getTimestamp));
        return result;
    }

}

