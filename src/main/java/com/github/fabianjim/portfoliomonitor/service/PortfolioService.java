package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.dto.PortfolioHistoryDTO;
import com.github.fabianjim.portfoliomonitor.model.Holding;
import com.github.fabianjim.portfoliomonitor.model.JournalEntry;
import com.github.fabianjim.portfoliomonitor.model.JournalEntryType;
import com.github.fabianjim.portfoliomonitor.model.Portfolio;
import com.github.fabianjim.portfoliomonitor.model.Stock;
import com.github.fabianjim.portfoliomonitor.model.TrackedStock;
import com.github.fabianjim.portfoliomonitor.model.Transaction;
import com.github.fabianjim.portfoliomonitor.model.User;
import com.github.fabianjim.portfoliomonitor.repository.JournalEntryRepository;
import com.github.fabianjim.portfoliomonitor.repository.PortfolioRepository;
import com.github.fabianjim.portfoliomonitor.repository.StockRepository;
import com.github.fabianjim.portfoliomonitor.repository.TrackedStockRepository;
import com.github.fabianjim.portfoliomonitor.repository.UserRepository;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@Transactional
public class PortfolioService {

    private final PortfolioRepository portfolioRepository;
    private final StockService stockService;
    private final UserRepository userRepository;
    private final TrackedStockRepository trackedStockRepository;
    private final StockRepository stockRepository;
    private final TransactionService transactionService;
    private final JournalEntryRepository journalEntryRepository;

    public PortfolioService(PortfolioRepository portfolioRepository,
                          StockService stockService,
                          UserRepository userRepository,
                          TrackedStockRepository trackedStockRepository,
                          StockRepository stockRepository,
                          TransactionService transactionService,
                          JournalEntryRepository journalEntryRepository) {
        this.portfolioRepository = portfolioRepository;
        this.stockService = stockService;
        this.userRepository = userRepository;
        this.trackedStockRepository = trackedStockRepository;
        this.stockRepository = stockRepository;
        this.transactionService = transactionService;
        this.journalEntryRepository = journalEntryRepository;
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
            portfolioRepository.save(portfolio);

            // Track all tickers in the new portfolio and record buy transactions
            for (Holding holding : portfolio.getHoldings()) {
                startTrackingStock(holding.getTicker());
                // Fetch initial price data immediately
                Stock stock = stockService.updateStockData(holding.getTicker(), Stock.StockType.INITIAL);
                
                // Record buy transaction for initial holding with actual price
                double price = (stock != null) ? stock.getCurrentPrice() : 0.0;
                if (price > 0.0) {
                    transactionService.recordBuyTransaction(holding.getTicker(), holding.getShares(), price);
                }
            }
        }
    }

    /**
     * Start tracking a stock ticker. If already tracked, increment holder count.
     */
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

    /**
     * Stop tracking a stock ticker. Decrement holder count, delete if no holders remain.
     */
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

    /**
     * Add a holding to the current user's portfolio.
     */
    public void addHolding(String ticker, double shares) {
        Portfolio portfolio = getPortfolio();
        if (portfolio == null) {
            throw new RuntimeException("No portfolio found for current user");
        }

        // Get current price for transaction
        double currentPrice = stockService.getLatestStockData(ticker)
            .map(Stock::getCurrentPrice)
            .orElse(0.0);

        Holding newHolding = new Holding(ticker, shares);
        portfolio.getHoldings().add(newHolding);
        portfolioRepository.save(portfolio);

        // Start tracking and fetch initial data
        startTrackingStock(ticker);
        stockService.updateStockData(ticker, Stock.StockType.INITIAL);

        // Record buy transaction
        transactionService.recordBuyTransaction(ticker, shares, currentPrice);
    }

    /**
     * Remove a holding from the current user's portfolio.
     */
    public void removeHolding(String ticker) {
        Portfolio portfolio = getPortfolio();
        if (portfolio == null) {
            throw new RuntimeException("No portfolio found for current user");
        }

        // Get shares and current price for transaction before removing
        double shares = portfolio.getHoldings().stream()
            .filter(h -> h.getTicker().equals(ticker))
            .findFirst()
            .map(Holding::getShares)
            .orElse(0.0);
        
        double currentPrice = stockService.getLatestStockData(ticker)
            .map(Stock::getCurrentPrice)
            .orElse(0.0);

        portfolio.getHoldings().removeIf(h -> h.getTicker().equals(ticker));
        portfolioRepository.save(portfolio);

        // Stop tracking this stock
        stopTrackingStock(ticker);

        // Record sell transaction
        if (shares > 0) {
            transactionService.recordSellTransaction(ticker, shares, currentPrice);
        }
    }

    /**
     * Sell a portion of a holding (partial sell).
     */
    public void sellHolding(String ticker, double sharesToSell) {
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

        double currentPrice = stockService.getLatestStockData(ticker)
            .map(Stock::getCurrentPrice)
            .orElse(0.0);

        // Record sell transaction
        transactionService.recordSellTransaction(ticker, sharesToSell, currentPrice);

        // Update or remove holding
        if (sharesToSell == holding.getShares()) {
            // Selling all shares - remove the holding
            portfolio.getHoldings().removeIf(h -> h.getTicker().equals(ticker));
            stopTrackingStock(ticker);
        } else {
            // Partial sell - update shares
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


    public void updatePortfolio(Portfolio portfolio) {
        
        /* System.out.println(getCurrentUserId());
        Integer userId = getCurrentUserId();
        portfolio.setId(userId);
        if (portfolio != null && portfolio.getHoldings() != null) {
            List<String> tickers = portfolio.getHoldings().stream()
                .map(Holding::getTicker)
                .distinct()
                .toList();
            System.out.println(portfolio.getHoldings().stream()
                .map(Holding::getTicker)
                .distinct()
                .toList());
            
            stockService.updateMultipleStocks(tickers);
            
            portfolioRepository.save(portfolio);
        }
        */
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

    /**
     * Get top N trending stocks by holder count
     */
    public List<TrackedStock> getTopTrendingStocks(int limit) {
        return trackedStockRepository.findTopTrackedStocks(limit);
    }

    /**
     * Calculate portfolio value history for the current user's portfolio.
     * Replays transactions chronologically to determine holdings at each point in time.
     * Includes journal entry markers during trading hours.
     */
    public List<PortfolioHistoryDTO> getPortfolioHistory() {
        Portfolio portfolio = getPortfolio();
        if (portfolio == null) {
            return new ArrayList<>();
        }

        // Get transaction history to replay holdings chronologically
        List<Transaction> transactions = transactionService.getTransactionHistory();
        
        // Build a map of ticker -> list of (timestamp, shares delta)
        // This allows us to know how many shares of each ticker existed at any point in time
        Map<String, List<Transaction>> transactionsByTicker = new HashMap<>();
        for (Transaction tx : transactions) {
            transactionsByTicker.computeIfAbsent(tx.getTicker(), k -> new ArrayList<>()).add(tx);
        }

        // Get all tickers ever held (from transactions + current holdings)
        Set<String> allTickers = new HashSet<>();
        allTickers.addAll(transactionsByTicker.keySet());
        if (portfolio.getHoldings() != null) {
            for (Holding holding : portfolio.getHoldings()) {
                allTickers.add(holding.getTicker());
            }
        }

        if (allTickers.isEmpty()) {
            return new ArrayList<>();
        }

        // Fetch historical stock data for all tickers
        Map<Instant, Map<String, Stock>> dataByHourBucket = new HashMap<>();
        for (String ticker : allTickers) {
            List<Stock> stockHistory = stockRepository.findByTickerOrderByTimestampDesc(ticker);
            for (Stock stock : stockHistory) {
                dataByHourBucket
                    .computeIfAbsent(stock.getHourBucket(), k -> new HashMap<>())
                    .put(stock.getTicker(), stock);
            }
        }

        // Calculate portfolio value at each hour bucket using transaction replay
        List<PortfolioHistoryDTO> historyPoints = new ArrayList<>();
        
        List<Instant> sortedHours = new ArrayList<>(dataByHourBucket.keySet());
        sortedHours.sort(Comparator.naturalOrder());
        
        for (Instant hourBucket : sortedHours) {
            Map<String, Stock> stocksAtHour = dataByHourBucket.get(hourBucket);
            
            // Replay transactions up to this hour to determine holdings
            Map<String, Double> sharesAtHour = new HashMap<>();
            for (Map.Entry<String, List<Transaction>> entry : transactionsByTicker.entrySet()) {
                String ticker = entry.getKey();
                double shares = 0;
                for (Transaction tx : entry.getValue()) {
                    if (!tx.getTimestamp().isAfter(hourBucket)) {
                        if (tx.getType() == Transaction.TransactionType.BUY) {
                            shares += tx.getShares();
                        } else {
                            shares -= tx.getShares();
                        }
                    }
                }
                if (shares > 0) {
                    sharesAtHour.put(ticker, shares);
                }
            }
            
            // Also include current holdings for tickers without transactions
            // (e.g., initial portfolio holdings before transaction recording)
            if (portfolio.getHoldings() != null) {
                for (Holding holding : portfolio.getHoldings()) {
                    if (!transactionsByTicker.containsKey(holding.getTicker()) && 
                        !holding.getBuyTimestamp().isAfter(hourBucket)) {
                        sharesAtHour.put(holding.getTicker(), holding.getShares());
                    }
                }
            }
            
            // Calculate portfolio value using available data
            double totalValue = 0.0;
            boolean hasAnyData = false;
            
            for (Map.Entry<String, Double> holdingEntry : sharesAtHour.entrySet()) {
                String ticker = holdingEntry.getKey();
                double shares = holdingEntry.getValue();
                Stock stock = stocksAtHour.get(ticker);
                
                if (stock != null) {
                    totalValue += stock.getCurrentPrice() * shares;
                    hasAnyData = true;
                }
            }
            
            if (hasAnyData) {
                historyPoints.add(new PortfolioHistoryDTO(hourBucket, totalValue));
            }
        }
        
        // Get journal entries and create markers
        List<JournalEntry> journalEntries = journalEntryRepository.findByUserIdOrderByTimestampDesc(getCurrentUserId());
        List<PortfolioHistoryDTO> markers = new ArrayList<>();
        
        for (JournalEntry entry : journalEntries) {
            // Only create markers for trading hours (10 AM - 4 PM ET)
            if (!isDuringTradingHours(entry.getTimestamp())) {
                continue;
            }
            
            // Find portfolio value at this timestamp
            // Transaction replay already includes BUY/SELL effects, so value is post-transaction
            double portfolioValue = calculatePortfolioValueAtTime(entry.getTimestamp(), transactions, transactionsByTicker, dataByHourBucket, portfolio);
            
            markers.add(new PortfolioHistoryDTO(
                entry.getTimestamp(),
                portfolioValue,
                true,
                entry.getEntryType().name(),
                entry.getId()
            ));
        }
        
        // Combine history points and markers, sort by timestamp
        List<PortfolioHistoryDTO> result = new ArrayList<>();
        result.addAll(historyPoints);
        result.addAll(markers);
        result.sort(Comparator.comparing(PortfolioHistoryDTO::getTimestamp));
        
        return result;
    }
    
    private boolean isDuringTradingHours(Instant timestamp) {
        ZonedDateTime etTime = timestamp.atZone(ZoneId.of("America/New_York"));
        int hour = etTime.getHour();
        return hour >= 10 && hour < 16;
    }
    
    private double calculatePortfolioValueAtTime(Instant timestamp, List<Transaction> transactions, 
                                                  Map<String, List<Transaction>> transactionsByTicker,
                                                  Map<Instant, Map<String, Stock>> dataByHourBucket,
                                                  Portfolio portfolio) {
        // Replay transactions up to this timestamp
        Map<String, Double> sharesAtTime = new HashMap<>();
        for (Transaction tx : transactions) {
            if (!tx.getTimestamp().isAfter(timestamp)) {
                sharesAtTime.merge(tx.getTicker(), 
                    tx.getType() == Transaction.TransactionType.BUY ? tx.getShares() : -tx.getShares(),
                    Double::sum);
            }
        }
        
        // Also include holdings for tickers without transactions
        if (portfolio != null && portfolio.getHoldings() != null) {
            for (Holding holding : portfolio.getHoldings()) {
                if (!transactionsByTicker.containsKey(holding.getTicker()) && 
                    !holding.getBuyTimestamp().isAfter(timestamp)) {
                    sharesAtTime.put(holding.getTicker(), holding.getShares());
                }
            }
        }
        
        // Remove zero or negative share counts
        sharesAtTime.entrySet().removeIf(e -> e.getValue() <= 0);
        
        // Find the closest hour bucket before or at this timestamp
        Instant closestHour = null;
        for (Instant hour : dataByHourBucket.keySet()) {
            if (!hour.isAfter(timestamp)) {
                if (closestHour == null || hour.isAfter(closestHour)) {
                    closestHour = hour;
                }
            }
        }
        
        if (closestHour == null) {
            return 0.0;
        }
        
        Map<String, Stock> stocksAtHour = dataByHourBucket.get(closestHour);
        double totalValue = 0.0;
        
        for (Map.Entry<String, Double> entry : sharesAtTime.entrySet()) {
            Stock stock = stocksAtHour.get(entry.getKey());
            if (stock != null) {
                totalValue += stock.getCurrentPrice() * entry.getValue();
            }
        }
        
        return totalValue;
    }
    
    private Transaction findMatchingTransaction(JournalEntry entry, List<Transaction> transactions) {
        // Match by ticker, type, and timestamp within 5 minutes
        for (Transaction tx : transactions) {
            if (tx.getTicker().equals(entry.getTicker()) &&
                tx.getType().name().equals(entry.getEntryType().name()) &&
                Math.abs(tx.getTimestamp().getEpochSecond() - entry.getTimestamp().getEpochSecond()) <= 300) {
                return tx;
            }
        }
        return null;
    }
}

