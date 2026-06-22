package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.dto.PnLSummaryDTO;
import com.github.fabianjim.portfoliomonitor.dto.PortfolioHistoryDTO;
import com.github.fabianjim.portfoliomonitor.exception.DemoTradeLimitExceededException;
import com.github.fabianjim.portfoliomonitor.exception.PriceFetchException;
import com.github.fabianjim.portfoliomonitor.exception.UnknownTickerException;
import com.github.fabianjim.portfoliomonitor.model.DemoSession;
import com.github.fabianjim.portfoliomonitor.model.Holding;
import com.github.fabianjim.portfoliomonitor.model.JournalEntry;
import com.github.fabianjim.portfoliomonitor.model.Portfolio;
import com.github.fabianjim.portfoliomonitor.model.Stock;
import com.github.fabianjim.portfoliomonitor.model.Transaction;
import com.github.fabianjim.portfoliomonitor.model.WatchlistItem;
import com.github.fabianjim.portfoliomonitor.model.TrackedStock;
import com.github.fabianjim.portfoliomonitor.repository.HoldingRepository;
import com.github.fabianjim.portfoliomonitor.repository.JournalEntryRepository;
import com.github.fabianjim.portfoliomonitor.repository.PortfolioRepository;
import com.github.fabianjim.portfoliomonitor.repository.StockRepository;
import com.github.fabianjim.portfoliomonitor.repository.TrackedStockRepository;
import com.github.fabianjim.portfoliomonitor.repository.TransactionRepository;
import com.github.fabianjim.portfoliomonitor.repository.WatchlistItemRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.TimeUnit;

@Service
public class DemoSessionService {

    private static final Logger logger = LoggerFactory.getLogger(DemoSessionService.class);

    private final PortfolioRepository portfolioRepository;
    private final HoldingRepository holdingRepository;
    private final TransactionRepository transactionRepository;
    private final JournalEntryRepository journalEntryRepository;
    private final WatchlistItemRepository watchlistItemRepository;
    private final StockRepository stockRepository;
    private final StockService stockService;
    private final TrackedStockRepository trackedStockRepository;

    public DemoSessionService(PortfolioRepository portfolioRepository,
                              HoldingRepository holdingRepository,
                              TransactionRepository transactionRepository,
                              JournalEntryRepository journalEntryRepository,
                              WatchlistItemRepository watchlistItemRepository,
                              StockRepository stockRepository,
                              StockService stockService,
                              TrackedStockRepository trackedStockRepository) {
        this.portfolioRepository = portfolioRepository;
        this.holdingRepository = holdingRepository;
        this.transactionRepository = transactionRepository;
        this.journalEntryRepository = journalEntryRepository;
        this.watchlistItemRepository = watchlistItemRepository;
        this.stockRepository = stockRepository;
        this.stockService = stockService;
        this.trackedStockRepository = trackedStockRepository;
    }

    public DemoSession createSession(com.github.fabianjim.portfoliomonitor.model.User user) {
        DemoSession session = new DemoSession();

        Portfolio dbPortfolio = portfolioRepository.findByUserId(user.getId()).orElse(null);
        if (dbPortfolio != null) {
            Portfolio portfolioCopy = new Portfolio();
            portfolioCopy.setId(session.nextId());
            portfolioCopy.setUser(user);

            List<Holding> holdingsCopy = new ArrayList<>();
            if (dbPortfolio.getHoldings() != null) {
                for (Holding h : dbPortfolio.getHoldings()) {
                    Holding copy = new Holding(h.getTicker(), h.getShares());
                    copy.setId(session.nextId());
                    copy.setBuyTimestamp(h.getBuyTimestamp());
                    copy.setMetadata(h.getMetadata());
                    holdingsCopy.add(copy);
                }
            }
            portfolioCopy.setHoldings(holdingsCopy);
            session.setPortfolio(portfolioCopy);

            for (Holding holding : holdingsCopy) {
                String ticker = holding.getTicker();
                startTrackingStockForSession(session, ticker);
            }
        }

        List<Transaction> txCopy = new ArrayList<>();
        for (Transaction tx : transactionRepository.findByUserIdOrderByTimestampDesc(user.getId())) {
            Transaction copy = new Transaction(tx.getTicker(), tx.getShares(), tx.getPrice(), tx.getType(), tx.isInitial());
            copy.setId(session.nextId());
            copy.setTimestamp(tx.getTimestamp());
            copy.setTotalValue(tx.getTotalValue());
            copy.setUser(user);
            txCopy.add(copy);
        }
        session.setTransactions(txCopy);

        List<JournalEntry> journalCopy = new ArrayList<>();
        for (JournalEntry entry : journalEntryRepository.findByUserIdOrderByTimestampDesc(user.getId())) {
            JournalEntry copy = new JournalEntry();
            copy.setId(session.nextId());
            copy.setEntryType(entry.getEntryType());
            copy.setBody(entry.getBody());
            copy.setTicker(entry.getTicker());
            copy.setTimestamp(entry.getTimestamp());
            copy.setPriceSnapshot(entry.getPriceSnapshot());
            copy.setUser(user);
            journalCopy.add(copy);
        }
        session.setJournalEntries(journalCopy);

        List<WatchlistItem> watchlistCopy = new ArrayList<>();
        for (WatchlistItem item : watchlistItemRepository.findByUserId(user.getId())) {
            WatchlistItem copy = new WatchlistItem();
            copy.setId(session.nextId());
            copy.setTicker(item.getTicker());
            copy.setUser(user);
            copy.setMetadata(item.getMetadata());
            watchlistCopy.add(copy);
        }
        session.setWatchlistItems(watchlistCopy);

        return session;
    }

    public Portfolio getPortfolio(DemoSession session) {
        return session.getPortfolio();
    }

    public boolean existsByUserId(DemoSession session) {
        return session.getPortfolio() != null;
    }

    public void createPortfolio(DemoSession session, com.github.fabianjim.portfoliomonitor.model.User user, Portfolio portfolio) {
        if (portfolio != null && portfolio.getHoldings() != null) {
            Map<String, Holding> byTicker = new HashMap<>();
            List<Holding> aggregated = new ArrayList<>();
            for (Holding holding : portfolio.getHoldings()) {
                Holding existing = byTicker.get(holding.getTicker());
                if (existing != null) {
                    existing.setShares(existing.getShares() + holding.getShares());
                } else {
                    Holding copy = new Holding(holding.getTicker(), holding.getShares());
                    copy.setId(session.nextId());
                    byTicker.put(holding.getTicker(), copy);
                    aggregated.add(copy);
                }
            }

            Map<String, Double> tickerPrices = new HashMap<>();
            for (Holding holding : aggregated) {
                tickerPrices.put(holding.getTicker(), fetchTransactionPrice(holding.getTicker()));
            }

            Portfolio newPortfolio = new Portfolio();
            newPortfolio.setId(session.nextId());
            newPortfolio.setUser(user);
            newPortfolio.setHoldings(aggregated);
            session.setPortfolio(newPortfolio);

            for (Holding holding : aggregated) {
                double price = tickerPrices.get(holding.getTicker());
                recordBuyTransaction(session, user, holding.getTicker(), holding.getShares(), price, holding.getBuyTimestamp(), true);
                startTrackingStockForSession(session, holding.getTicker());
            }
        }
    }

    public void addHolding(DemoSession session, com.github.fabianjim.portfoliomonitor.model.User user, String ticker, double shares, Double price, Instant timestamp) {
        assertTradeRemaining(session);
        Portfolio portfolio = session.getPortfolio();
        if (portfolio == null) {
            throw new RuntimeException("No portfolio found for current user");
        }

        double currentPrice = (price != null && price > 0) ? price : fetchTransactionPrice(ticker);

        Holding existing = portfolio.getHoldings().stream()
            .filter(h -> h.getTicker().equals(ticker))
            .findFirst()
            .orElse(null);

        if (existing != null) {
            existing.setShares(existing.getShares() + shares);
        } else {
            Holding newHolding = new Holding(ticker, shares);
            newHolding.setId(session.nextId());
            if (timestamp != null) {
                newHolding.setBuyTimestamp(timestamp);
            }
            portfolio.getHoldings().add(newHolding);
            startTrackingStockForSession(session, ticker);
        }

        session.setRemainingTrades(session.getRemainingTrades() - 1);
        recordBuyTransaction(session, user, ticker, shares, currentPrice, timestamp, false);
    }

    public void removeHolding(DemoSession session, com.github.fabianjim.portfoliomonitor.model.User user, String ticker, Double price, Instant timestamp) {
        assertTradeRemaining(session);
        Portfolio portfolio = session.getPortfolio();
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
        double currentPrice = (price != null && price > 0) ? price : fetchTransactionPrice(ticker);

        portfolio.getHoldings().remove(holding);
        stopTrackingStockForSession(session, ticker);
        session.setRemainingTrades(session.getRemainingTrades() - 1);
        recordSellTransaction(session, user, ticker, shares, currentPrice, timestamp);
    }

    public void sellHolding(DemoSession session, com.github.fabianjim.portfoliomonitor.model.User user, String ticker, double sharesToSell, Double price, Instant timestamp) {
        assertTradeRemaining(session);
        Portfolio portfolio = session.getPortfolio();
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

        double currentPrice = (price != null && price > 0) ? price : fetchTransactionPrice(ticker);

        session.setRemainingTrades(session.getRemainingTrades() - 1);
        recordSellTransaction(session, user, ticker, sharesToSell, currentPrice, timestamp);

        if (sharesToSell == holding.getShares()) {
            portfolio.getHoldings().remove(holding);
            stopTrackingStockForSession(session, ticker);
        } else {
            holding.setShares(holding.getShares() - sharesToSell);
        }
    }

    private void assertTradeRemaining(DemoSession session) {
        if (session.getRemainingTrades() <= 0) {
            throw new DemoTradeLimitExceededException();
        }
    }

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
                throw e;
            } catch (Exception e) {
                lastError = e;
            }
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

    public void startTrackingStockForSession(DemoSession session, String ticker) {
        if (session.getSessionTrackedTickers().contains(ticker)) {
            return;
        }
        TrackedStock trackedStock = trackedStockRepository.findByTicker(ticker)
            .orElse(null);

        if (trackedStock == null) {
            trackedStock = new TrackedStock(ticker);
            trackedStockRepository.save(trackedStock);
            logger.info("Demo session created new tracked stock for ticker={}", ticker);
        } else {
            trackedStock.incrementHolderCount();
            trackedStockRepository.save(trackedStock);
            logger.info("Demo session incremented holder count for ticker={} to {}", ticker, trackedStock.getHolderCount());
        }
        session.getSessionTrackedTickers().add(ticker);
    }

    public void stopTrackingStockForSession(DemoSession session, String ticker) {
        if (!session.getSessionTrackedTickers().contains(ticker)) {
            logger.warn("Demo session attempted to stop tracking ticker={} that it was not responsible for", ticker);
            return;
        }
        TrackedStock trackedStock = trackedStockRepository.findByTicker(ticker)
            .orElse(null);

        if (trackedStock != null) {
            trackedStock.decrementHolderCount();
            if (trackedStock.getHolderCount() <= 0) {
                trackedStockRepository.delete(trackedStock);
                logger.info("Demo session deleted tracked stock for ticker={}", ticker);
            } else {
                trackedStockRepository.save(trackedStock);
                logger.info("Demo session decremented holder count for ticker={} to {}", ticker, trackedStock.getHolderCount());
            }
        } else {
            logger.warn("Demo session could not find tracked stock to stop tracking ticker={}", ticker);
        }
        session.getSessionTrackedTickers().remove(ticker);
    }

    private Transaction recordBuyTransaction(DemoSession session, com.github.fabianjim.portfoliomonitor.model.User user, String ticker, double shares, double price, Instant timestamp, boolean isInitial) {
        Transaction transaction = new Transaction(ticker, shares, price, Transaction.TransactionType.BUY, isInitial);
        if (timestamp != null) {
            transaction.setTimestamp(timestamp);
        }
        transaction.setTotalValue(shares * price);
        transaction.setUser(user);
        transaction.setId(session.nextId());
        session.getTransactions().add(transaction);
        return transaction;
    }

    private Transaction recordSellTransaction(DemoSession session, com.github.fabianjim.portfoliomonitor.model.User user, String ticker, double shares, double price, Instant timestamp) {
        Transaction transaction = new Transaction(ticker, shares, price, Transaction.TransactionType.SELL, false);
        if (timestamp != null) {
            transaction.setTimestamp(timestamp);
        }
        transaction.setTotalValue(shares * price);
        transaction.setUser(user);
        transaction.setId(session.nextId());
        session.getTransactions().add(transaction);
        return transaction;
    }

    public List<Transaction> getTransactions(DemoSession session) {
        List<Transaction> result = new ArrayList<>(session.getTransactions());
        result.sort(Comparator.comparing(Transaction::getTimestamp).reversed());
        return result;
    }

    public PnLSummaryDTO getPnLSummary(DemoSession session) {
        List<Transaction> transactions = session.getTransactions();

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
                double currentPrice = stockService.getLatestStockData(ticker)
                    .map(Stock::getCurrentPrice)
                    .orElse(0.0);
                double unrealizedForTicker = (currentPrice - avgCost) * currentShares;
                totalUnrealized += unrealizedForTicker;
                totalCurrentCostBasis += avgCost * currentShares;
            }
        }

        double totalPnL = totalUnrealized + totalRealized;
        double totalCostBasis = totalCurrentCostBasis + totalSoldCostBasis;
        double totalPnLPercent = totalCostBasis > 0 ? (totalPnL / totalCostBasis) * 100 : 0;
        double unrealizedPercent = totalCurrentCostBasis > 0 ? (totalUnrealized / totalCurrentCostBasis) * 100 : 0;
        double realizedPercent = totalSoldCostBasis > 0 ? (totalRealized / totalSoldCostBasis) * 100 : 0;

        return new PnLSummaryDTO(totalPnL, totalPnLPercent, totalUnrealized, unrealizedPercent, totalRealized, realizedPercent);
    }

    public List<PortfolioHistoryDTO> getPortfolioHistory(DemoSession session) {
        Portfolio portfolio = session.getPortfolio();
        if (portfolio == null || portfolio.getHoldings() == null || portfolio.getHoldings().isEmpty()) {
            return new ArrayList<>();
        }

        List<Holding> holdings = portfolio.getHoldings();
        List<Transaction> transactions = session.getTransactions();
        Map<String, List<Transaction>> transactionsByTicker = new HashMap<>();
        for (Transaction tx : transactions) {
            transactionsByTicker.computeIfAbsent(tx.getTicker(), k -> new ArrayList<>()).add(tx);
        }

        Map<Instant, Map<String, Stock>> dataByHourBucket = new HashMap<>();

        for (Holding holding : holdings) {
            List<Stock> stockHistory = stockRepository.findByTickerOrderByTimestampDesc(holding.getTicker());
            for (Stock stock : stockHistory) {
                if (stock.getType() == Stock.StockType.EOD) {
                    continue;
                }

                Instant effectiveBucket = stock.getHourBucket();
                if (stock.getType() == Stock.StockType.INITIAL) {
                    effectiveBucket = effectiveBucket.truncatedTo(ChronoUnit.MINUTES);
                }

                if (stock.getType() == Stock.StockType.INITIAL ||
                    !effectiveBucket.isBefore(holding.getBuyTimestamp())) {
                    dataByHourBucket
                        .computeIfAbsent(effectiveBucket, k -> new HashMap<>())
                        .put(stock.getTicker(), stock);
                }
            }
        }

        List<PortfolioHistoryDTO> result = new ArrayList<>();

        for (Map.Entry<Instant, Map<String, Stock>> entry : dataByHourBucket.entrySet()) {
            Instant hourBucket = entry.getKey();
            Map<String, Stock> stocksAtHour = entry.getValue();

            Map<String, Double> sharesAtTime = new HashMap<>();
            for (Map.Entry<String, List<Transaction>> tickerTxs : transactionsByTicker.entrySet()) {
                String ticker = tickerTxs.getKey();
                double shares = 0;
                for (Transaction tx : tickerTxs.getValue()) {
                    Instant txMinute = tx.getTimestamp().truncatedTo(ChronoUnit.MINUTES);
                    if (!txMinute.isAfter(hourBucket)) {
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

        result.sort(Comparator.comparing(PortfolioHistoryDTO::getTimestamp));
        return result;
    }

    public List<String> getTickersFromPortfolio(DemoSession session) {
        Portfolio portfolio = session.getPortfolio();
        if (portfolio == null || portfolio.getHoldings() == null) {
            return List.of();
        }
        return portfolio.getHoldings().stream()
            .map(Holding::getTicker)
            .distinct()
            .toList();
    }

    public JournalEntry createJournalEntry(DemoSession session, com.github.fabianjim.portfoliomonitor.model.User user, JournalEntry entry) {
        entry.setUser(user);
        entry.setId(session.nextId());
        if (entry.getTimestamp() == null) {
            entry.setTimestamp(Instant.now());
        }
        if (entry.getPriceSnapshot() == null) {
            if (entry.getTicker() != null && !entry.getTicker().isBlank()) {
                entry.setPriceSnapshot(stockService.getLatestStockData(entry.getTicker())
                    .map(Stock::getCurrentPrice)
                    .orElse(0.0));
            } else {
                entry.setPriceSnapshot(null);
            }
        }
        session.getJournalEntries().add(entry);
        return entry;
    }

    public List<JournalEntry> getJournalEntries(DemoSession session) {
        List<JournalEntry> result = new ArrayList<>(session.getJournalEntries());
        result.sort(Comparator.comparing(JournalEntry::getTimestamp).reversed());
        return result;
    }

    public List<JournalEntry> getJournalEntriesForTicker(DemoSession session, String ticker) {
        return getJournalEntries(session).stream()
            .filter(e -> ticker.equals(e.getTicker()))
            .toList();
    }

    public List<JournalEntry> getJournalEntriesInRange(DemoSession session, Instant from, Instant to) {
        return getJournalEntries(session).stream()
            .filter(e -> !e.getTimestamp().isBefore(from) && !e.getTimestamp().isAfter(to))
            .toList();
    }

    public void deleteJournalEntry(DemoSession session, int id) {
        boolean removed = session.getJournalEntries().removeIf(e -> e.getId() == id);
        if (!removed) {
            throw new RuntimeException("Journal entry not found");
        }
    }

    public JournalEntry updateJournalEntry(DemoSession session, int id, String body) {
        Optional<JournalEntry> entryOpt = session.getJournalEntries().stream()
            .filter(e -> e.getId() == id)
            .findFirst();
        if (entryOpt.isEmpty()) {
            throw new RuntimeException("Journal entry not found");
        }
        JournalEntry entry = entryOpt.get();
        entry.setBody(body);
        return entry;
    }

    public WatchlistItem addToWatchlist(DemoSession session, com.github.fabianjim.portfoliomonitor.model.User user, String ticker) {
        String normalizedTicker = ticker.trim().toUpperCase();
        boolean exists = session.getWatchlistItems().stream()
            .anyMatch(item -> item.getTicker().equals(normalizedTicker));
        if (exists) {
            throw new RuntimeException("Ticker already in watchlist");
        }
        WatchlistItem item = new WatchlistItem();
        item.setId(session.nextId());
        item.setUser(user);
        item.setTicker(normalizedTicker);
        session.getWatchlistItems().add(item);
        return item;
    }

    public List<WatchlistItem> getWatchlistItems(DemoSession session) {
        return new ArrayList<>(session.getWatchlistItems());
    }

    public void removeFromWatchlist(DemoSession session, String ticker) {
        String normalizedTicker = ticker.trim().toUpperCase();
        boolean removed = session.getWatchlistItems().removeIf(item -> item.getTicker().equals(normalizedTicker));
        if (!removed) {
            throw new RuntimeException("Watchlist item not found");
        }
    }
}
