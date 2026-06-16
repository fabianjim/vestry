package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.dto.PnLSummaryDTO;
import com.github.fabianjim.portfoliomonitor.exception.DemoTradeLimitExceededException;
import com.github.fabianjim.portfoliomonitor.model.DemoSession;
import com.github.fabianjim.portfoliomonitor.model.Holding;
import com.github.fabianjim.portfoliomonitor.model.JournalEntry;
import com.github.fabianjim.portfoliomonitor.model.JournalEntryType;
import com.github.fabianjim.portfoliomonitor.model.Portfolio;
import com.github.fabianjim.portfoliomonitor.model.Stock;
import com.github.fabianjim.portfoliomonitor.model.Transaction;
import com.github.fabianjim.portfoliomonitor.model.User;
import com.github.fabianjim.portfoliomonitor.model.WatchlistItem;
import com.github.fabianjim.portfoliomonitor.model.TrackedStock;
import com.github.fabianjim.portfoliomonitor.repository.HoldingRepository;
import com.github.fabianjim.portfoliomonitor.repository.JournalEntryRepository;
import com.github.fabianjim.portfoliomonitor.repository.PortfolioRepository;
import com.github.fabianjim.portfoliomonitor.repository.StockRepository;
import com.github.fabianjim.portfoliomonitor.repository.TrackedStockRepository;
import com.github.fabianjim.portfoliomonitor.repository.TransactionRepository;
import com.github.fabianjim.portfoliomonitor.repository.WatchlistItemRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class DemoSessionServiceTest {

    @Mock
    private PortfolioRepository portfolioRepository;
    @Mock
    private HoldingRepository holdingRepository;
    @Mock
    private TransactionRepository transactionRepository;
    @Mock
    private JournalEntryRepository journalEntryRepository;
    @Mock
    private WatchlistItemRepository watchlistItemRepository;
    @Mock
    private StockRepository stockRepository;
    @Mock
    private StockService stockService;
    @Mock
    private TrackedStockRepository trackedStockRepository;

    @InjectMocks
    private DemoSessionService demoSessionService;

    private User demoUser;

    @BeforeEach
    void setUp() {
        demoUser = new User();
        demoUser.setId(5);
        demoUser.setUsername("demo");
        demoUser.setDemo(true);
    }

    @Test
    void createSessionCopiesPortfolioHoldingsTransactionsJournalAndWatchlist() {
        Portfolio portfolio = new Portfolio();
        portfolio.setId(10);
        portfolio.setUser(demoUser);
        Holding holding = new Holding("AAPL", 10);
        holding.setId(100);
        holding.setBuyTimestamp(Instant.now());
        portfolio.setHoldings(new ArrayList<>(List.of(holding)));

        Transaction tx = new Transaction("AAPL", 10, 150.0, Transaction.TransactionType.BUY, true);
        tx.setId(200);

        JournalEntry entry = new JournalEntry();
        entry.setId(300);
        entry.setEntryType(JournalEntryType.INSIGHT);
        entry.setBody("Insight");
        entry.setTimestamp(Instant.now());

        WatchlistItem item = new WatchlistItem();
        item.setId(400);
        item.setTicker("TSLA");
        item.setUser(demoUser);

        when(portfolioRepository.findByUserId(demoUser.getId())).thenReturn(Optional.of(portfolio));
        when(transactionRepository.findByUserIdOrderByTimestampDesc(demoUser.getId())).thenReturn(List.of(tx));
        when(journalEntryRepository.findByUserIdOrderByTimestampDesc(demoUser.getId())).thenReturn(List.of(entry));
        when(watchlistItemRepository.findByUserId(demoUser.getId())).thenReturn(List.of(item));

        DemoSession session = demoSessionService.createSession(demoUser);

        assertNotNull(session.getPortfolio());
        assertEquals(1, session.getPortfolio().getHoldings().size());
        assertTrue(session.getPortfolio().getHoldings().get(0).getId() < 0);
        assertEquals(1, session.getTransactions().size());
        assertTrue(session.getTransactions().get(0).getId() < 0);
        assertEquals(1, session.getJournalEntries().size());
        assertTrue(session.getJournalEntries().get(0).getId() < 0);
        assertEquals(1, session.getWatchlistItems().size());
        assertTrue(session.getWatchlistItems().get(0).getId() < 0);
        assertEquals(3, session.getRemainingTrades());
    }

    @Test
    void addHoldingDecreasesRemainingTradesAndRecordsTransaction() {
        DemoSession session = new DemoSession();
        Portfolio portfolio = new Portfolio();
        portfolio.setId(session.nextId());
        portfolio.setUser(demoUser);
        portfolio.setHoldings(new ArrayList<>());
        session.setPortfolio(portfolio);

        Stock stock = new Stock("META", Instant.now(), 300.0, 295.0, 290.0, 305.0, 294.0, Stock.StockType.INITIAL, Instant.now());
        when(stockService.updateStockData("META", Stock.StockType.INITIAL)).thenReturn(stock);
        when(trackedStockRepository.findByTicker("META")).thenReturn(Optional.empty());
        when(trackedStockRepository.save(any(TrackedStock.class))).thenAnswer(invocation -> invocation.getArgument(0));

        demoSessionService.addHolding(session, demoUser, "META", 5, null, null);

        assertEquals(2, session.getRemainingTrades());
        assertEquals(1, portfolio.getHoldings().size());
        assertEquals("META", portfolio.getHoldings().get(0).getTicker());
        assertEquals(5, portfolio.getHoldings().get(0).getShares());
        assertEquals(1, session.getTransactions().size());
        assertEquals(300.0, session.getTransactions().get(0).getPrice());
        verify(trackedStockRepository).save(any(TrackedStock.class));
    }

    @Test
    void sellHoldingRemovesHoldingWhenSellingAllShares() {
        DemoSession session = new DemoSession();
        Portfolio portfolio = new Portfolio();
        portfolio.setId(session.nextId());
        portfolio.setUser(demoUser);
        Holding holding = new Holding("NVDA", 10);
        holding.setId(session.nextId());
        portfolio.setHoldings(new ArrayList<>(List.of(holding)));
        session.setPortfolio(portfolio);

        Stock stock = new Stock("NVDA", Instant.now(), 200.0, 195.0, 190.0, 205.0, 194.0, Stock.StockType.INITIAL, Instant.now());
        TrackedStock tracked = new TrackedStock("NVDA");
        tracked.setHolderCount(1);
        when(stockService.updateStockData("NVDA", Stock.StockType.INITIAL)).thenReturn(stock);
        when(trackedStockRepository.findByTicker("NVDA")).thenReturn(Optional.of(tracked));

        demoSessionService.sellHolding(session, demoUser, "NVDA", 10, null, null);

        assertEquals(2, session.getRemainingTrades());
        assertTrue(portfolio.getHoldings().isEmpty());
        assertEquals(1, session.getTransactions().size());
        assertEquals(Transaction.TransactionType.SELL, session.getTransactions().get(0).getType());
        verify(trackedStockRepository).delete(tracked);
    }

    @Test
    void tradeLimitIsEnforced() {
        DemoSession session = new DemoSession();
        Portfolio portfolio = new Portfolio();
        portfolio.setId(session.nextId());
        portfolio.setUser(demoUser);
        portfolio.setHoldings(new ArrayList<>());
        session.setPortfolio(portfolio);

        Stock stock = new Stock("AAPL", Instant.now(), 150.0, 145.0, 140.0, 155.0, 144.0, Stock.StockType.INITIAL, Instant.now());
        when(stockService.updateStockData("AAPL", Stock.StockType.INITIAL)).thenReturn(stock);
        when(trackedStockRepository.findByTicker("AAPL")).thenReturn(Optional.empty());
        when(trackedStockRepository.save(any(TrackedStock.class))).thenAnswer(invocation -> invocation.getArgument(0));

        demoSessionService.addHolding(session, demoUser, "AAPL", 1, null, null);
        demoSessionService.addHolding(session, demoUser, "AAPL", 1, null, null);
        demoSessionService.addHolding(session, demoUser, "AAPL", 1, null, null);

        assertEquals(0, session.getRemainingTrades());
        assertThrows(DemoTradeLimitExceededException.class, () ->
            demoSessionService.addHolding(session, demoUser, "AAPL", 1, null, null));
    }

    @Test
    void journalEntryCrudWorksInSession() {
        DemoSession session = new DemoSession();
        session.setJournalEntries(new ArrayList<>());

        JournalEntry entry = new JournalEntry();
        entry.setEntryType(JournalEntryType.BUY);
        entry.setBody("Test entry");
        entry.setTicker("AAPL");

        when(stockService.getLatestStockData("AAPL")).thenReturn(Optional.empty());

        JournalEntry created = demoSessionService.createJournalEntry(session, demoUser, entry);
        assertTrue(created.getId() < 0);
        assertEquals(demoUser, created.getUser());

        List<JournalEntry> entries = demoSessionService.getJournalEntries(session);
        assertEquals(1, entries.size());

        JournalEntry updated = demoSessionService.updateJournalEntry(session, created.getId(), "Updated");
        assertEquals("Updated", updated.getBody());

        demoSessionService.deleteJournalEntry(session, created.getId());
        assertTrue(demoSessionService.getJournalEntries(session).isEmpty());
    }

    @Test
    void watchlistCrudWorksInSession() {
        DemoSession session = new DemoSession();
        session.setWatchlistItems(new ArrayList<>());

        WatchlistItem added = demoSessionService.addToWatchlist(session, demoUser, "BABA");
        assertEquals("BABA", added.getTicker());
        assertTrue(added.getId() < 0);

        List<WatchlistItem> items = demoSessionService.getWatchlistItems(session);
        assertEquals(1, items.size());

        assertThrows(RuntimeException.class, () -> demoSessionService.addToWatchlist(session, demoUser, "BABA"));

        demoSessionService.removeFromWatchlist(session, "BABA");
        assertTrue(demoSessionService.getWatchlistItems(session).isEmpty());
    }

    @Test
    void getPnLSummaryCalculatesFromSessionTransactions() {
        DemoSession session = new DemoSession();
        session.setTransactions(new ArrayList<>());

        Transaction buy = new Transaction("AAPL", 10, 100.0, Transaction.TransactionType.BUY, false);
        buy.setId(session.nextId());
        buy.setUser(demoUser);
        buy.setTotalValue(1000.0);
        session.getTransactions().add(buy);

        Stock latest = new Stock("AAPL", Instant.now(), 110.0, 105.0, 100.0, 115.0, 104.0, Stock.StockType.INTRADAY, Instant.now());
        when(stockService.getLatestStockData("AAPL")).thenReturn(Optional.of(latest));

        PnLSummaryDTO summary = demoSessionService.getPnLSummary(session);

        assertEquals(100.0, summary.getUnrealizedPnL(), 0.001);
        assertEquals(10.0, summary.getUnrealizedPnLPercent(), 0.001);
    }

    @Test
    void addHoldingIncrementsExistingTrackedStock() {
        DemoSession session = new DemoSession();
        Portfolio portfolio = new Portfolio();
        portfolio.setId(session.nextId());
        portfolio.setUser(demoUser);
        portfolio.setHoldings(new ArrayList<>());
        session.setPortfolio(portfolio);

        Stock stock = new Stock("TSLA", Instant.now(), 250.0, 245.0, 240.0, 255.0, 244.0, Stock.StockType.INITIAL, Instant.now());
        TrackedStock tracked = new TrackedStock("TSLA");
        tracked.setHolderCount(2);
        when(stockService.updateStockData("TSLA", Stock.StockType.INITIAL)).thenReturn(stock);
        when(trackedStockRepository.findByTicker("TSLA")).thenReturn(Optional.of(tracked));
        when(trackedStockRepository.save(tracked)).thenReturn(tracked);

        demoSessionService.addHolding(session, demoUser, "TSLA", 2, null, null);

        assertEquals(3, tracked.getHolderCount());
        verify(trackedStockRepository).save(tracked);
    }

    @Test
    void removeHoldingDecrementsTrackedStock() {
        DemoSession session = new DemoSession();
        Portfolio portfolio = new Portfolio();
        portfolio.setId(session.nextId());
        portfolio.setUser(demoUser);
        Holding holding = new Holding("MSFT", 5);
        holding.setId(session.nextId());
        portfolio.setHoldings(new ArrayList<>(List.of(holding)));
        session.setPortfolio(portfolio);

        Stock stock = new Stock("MSFT", Instant.now(), 400.0, 395.0, 390.0, 405.0, 394.0, Stock.StockType.INITIAL, Instant.now());
        TrackedStock tracked = new TrackedStock("MSFT");
        tracked.setHolderCount(2);
        when(stockService.updateStockData("MSFT", Stock.StockType.INITIAL)).thenReturn(stock);
        when(trackedStockRepository.findByTicker("MSFT")).thenReturn(Optional.of(tracked));
        when(trackedStockRepository.save(tracked)).thenReturn(tracked);

        demoSessionService.removeHolding(session, demoUser, "MSFT", null, null);

        assertEquals(1, tracked.getHolderCount());
        verify(trackedStockRepository).save(tracked);
        verify(trackedStockRepository, never()).delete(any(TrackedStock.class));
    }
}
