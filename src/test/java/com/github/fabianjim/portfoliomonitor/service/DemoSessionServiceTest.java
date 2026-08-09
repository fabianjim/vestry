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
import org.mockito.Spy;
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
    @Spy
    private RealizedPnlCalculator realizedPnlCalculator = new RealizedPnlCalculator();
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

        Transaction tx = new Transaction("AAPL", 10, 150.0, Transaction.TransactionType.BUY);
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
        assertTrue(session.getSessionTrackedTickers().contains("AAPL"));
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
        assertTrue(session.getSessionTrackedTickers().contains("META"));
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
        session.getSessionTrackedTickers().add("NVDA");
        when(stockService.updateStockData("NVDA", Stock.StockType.INITIAL)).thenReturn(stock);
        when(trackedStockRepository.findByTicker("NVDA")).thenReturn(Optional.of(tracked));

        demoSessionService.sellHolding(session, demoUser, "NVDA", 10, null, null);

        assertEquals(2, session.getRemainingTrades());
        assertTrue(portfolio.getHoldings().isEmpty());
        assertEquals(1, session.getTransactions().size());
        assertEquals(Transaction.TransactionType.SELL, session.getTransactions().get(0).getType());
        assertFalse(session.getSessionTrackedTickers().contains("NVDA"));
        verify(trackedStockRepository).delete(tracked);
    }

    @Test
    void sellHoldingCreatesTaggedSessionJournalEntry() {
        DemoSession session = new DemoSession();
        Portfolio portfolio = new Portfolio();
        portfolio.setId(session.nextId());
        portfolio.setUser(demoUser);
        Holding holding = new Holding("NVDA", 10);
        holding.setId(session.nextId());
        portfolio.setHoldings(new ArrayList<>(List.of(holding)));
        session.setPortfolio(portfolio);

        Transaction buy = new Transaction("NVDA", 10, 100.0, Transaction.TransactionType.BUY);
        buy.setId(session.nextId());
        buy.setTimestamp(Instant.now().minusSeconds(3600));
        buy.setTotalValue(1000.0);
        buy.setUser(demoUser);
        session.getTransactions().add(buy);

        Stock stock = new Stock("NVDA", Instant.now(), 150.0, 145.0, 140.0, 155.0, 144.0, Stock.StockType.INITIAL, Instant.now());
        TrackedStock tracked = new TrackedStock("NVDA");
        tracked.setHolderCount(1);
        session.getSessionTrackedTickers().add("NVDA");
        when(stockService.updateStockData("NVDA", Stock.StockType.INITIAL)).thenReturn(stock);
        when(trackedStockRepository.findByTicker("NVDA")).thenReturn(Optional.of(tracked));

        JournalEntry sellEntry = demoSessionService.sellHolding(session, demoUser, "NVDA", 10, null, null);

        assertNotNull(sellEntry);
        assertTrue(sellEntry.getId() < 0);
        assertEquals(JournalEntryType.SELL, sellEntry.getEntryType());
        assertEquals(1, sellEntry.getTags().size());
        assertEquals("win", sellEntry.getTags().iterator().next().getName());
        assertEquals("#10b981", sellEntry.getTags().iterator().next().getColor());
        assertTrue(session.getJournalEntries().contains(sellEntry));
        verify(journalEntryRepository, never()).save(any(JournalEntry.class));
    }

    @Test
    void sellHoldingLossCreatesLossTag() {
        DemoSession session = new DemoSession();
        Portfolio portfolio = new Portfolio();
        portfolio.setId(session.nextId());
        portfolio.setUser(demoUser);
        Holding holding = new Holding("NVDA", 10);
        holding.setId(session.nextId());
        portfolio.setHoldings(new ArrayList<>(List.of(holding)));
        session.setPortfolio(portfolio);

        Transaction buy = new Transaction("NVDA", 10, 200.0, Transaction.TransactionType.BUY);
        buy.setId(session.nextId());
        buy.setTimestamp(Instant.now().minusSeconds(3600));
        buy.setTotalValue(2000.0);
        buy.setUser(demoUser);
        session.getTransactions().add(buy);

        Stock stock = new Stock("NVDA", Instant.now(), 150.0, 145.0, 140.0, 155.0, 144.0, Stock.StockType.INITIAL, Instant.now());
        when(stockService.updateStockData("NVDA", Stock.StockType.INITIAL)).thenReturn(stock);

        JournalEntry sellEntry = demoSessionService.sellHolding(session, demoUser, "NVDA", 5, null, null);

        assertEquals(1, sellEntry.getTags().size());
        assertEquals("loss", sellEntry.getTags().iterator().next().getName());
        assertEquals("#ef4444", sellEntry.getTags().iterator().next().getColor());
    }

    @Test
    void createSessionDeduplicatesTagsByNameAcrossEntries() {
        com.github.fabianjim.portfoliomonitor.model.Tag shared = new com.github.fabianjim.portfoliomonitor.model.Tag();
        shared.setId(50);
        shared.setName("win");
        shared.setColor("#10b981");
        shared.setUser(demoUser);

        JournalEntry first = new JournalEntry();
        first.setId(1);
        first.setEntryType(JournalEntryType.SELL);
        first.setBody("First");
        first.setTimestamp(Instant.now());
        first.setTags(new java.util.HashSet<>(List.of(shared)));

        JournalEntry second = new JournalEntry();
        second.setId(2);
        second.setEntryType(JournalEntryType.SELL);
        second.setBody("Second");
        second.setTimestamp(Instant.now());
        second.setTags(new java.util.HashSet<>(List.of(shared)));

        when(portfolioRepository.findByUserId(demoUser.getId())).thenReturn(Optional.empty());
        when(transactionRepository.findByUserIdOrderByTimestampDesc(demoUser.getId())).thenReturn(List.of());
        when(journalEntryRepository.findByUserIdOrderByTimestampDesc(demoUser.getId())).thenReturn(List.of(first, second));
        when(watchlistItemRepository.findByUserId(demoUser.getId())).thenReturn(List.of());

        DemoSession session = demoSessionService.createSession(demoUser);

        com.github.fabianjim.portfoliomonitor.model.Tag firstTag = session.getJournalEntries().get(0).getTags().iterator().next();
        com.github.fabianjim.portfoliomonitor.model.Tag secondTag = session.getJournalEntries().get(1).getTags().iterator().next();
        assertSame(firstTag, secondTag);

        List<com.github.fabianjim.portfoliomonitor.model.Tag> popular = demoSessionService.getPopularTags(session, "", 10);
        assertEquals(1, popular.size());
        assertEquals("win", popular.get(0).getName());
        assertEquals(firstTag.getId(), popular.get(0).getId());
    }

    @Test
    void updateJournalEntryPreservesAutoResultTag() {
        DemoSession session = new DemoSession();

        Transaction buy = new Transaction("AAPL", 10, 100.0, Transaction.TransactionType.BUY);
        buy.setId(session.nextId());
        buy.setTimestamp(Instant.now().minusSeconds(3600));
        buy.setTotalValue(1000.0);
        buy.setUser(demoUser);
        session.getTransactions().add(buy);

        JournalEntry entry = new JournalEntry();
        entry.setEntryType(JournalEntryType.SELL);
        entry.setBody("Sold AAPL");
        entry.setTicker("AAPL");
        entry.setPriceSnapshot(120.0);

        JournalEntry created = demoSessionService.createJournalEntry(session, demoUser, entry, List.of());
        assertEquals("win", created.getTags().iterator().next().getName());

        JournalEntry updated = demoSessionService.updateJournalEntry(session, demoUser, created.getId(), "New note", List.of());
        assertEquals("New note", updated.getBody());
        assertEquals(1, updated.getTags().size());
        assertEquals("win", updated.getTags().iterator().next().getName());
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
        TrackedStock tracked = new TrackedStock("AAPL");
        tracked.setHolderCount(2);
        when(stockService.updateStockData("AAPL", Stock.StockType.INITIAL)).thenReturn(stock);
        when(trackedStockRepository.findByTicker("AAPL")).thenReturn(Optional.of(tracked));
        when(trackedStockRepository.save(tracked)).thenReturn(tracked);

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

        JournalEntry created = demoSessionService.createJournalEntry(session, demoUser, entry, List.of());
        assertTrue(created.getId() < 0);
        assertEquals(demoUser, created.getUser());

        List<JournalEntry> entries = demoSessionService.getJournalEntries(session);
        assertEquals(1, entries.size());

        JournalEntry updated = demoSessionService.updateJournalEntry(session, demoUser, created.getId(), "Updated", List.of());
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

        Transaction buy = new Transaction("AAPL", 10, 100.0, Transaction.TransactionType.BUY);
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
    void createSessionIncrementsTrackedStockForDefaultHoldings() {
        Portfolio portfolio = new Portfolio();
        portfolio.setId(10);
        portfolio.setUser(demoUser);
        Holding holding = new Holding("AAPL", 10);
        holding.setId(100);
        portfolio.setHoldings(new ArrayList<>(List.of(holding)));

        TrackedStock tracked = new TrackedStock("AAPL");
        tracked.setHolderCount(2);
        when(portfolioRepository.findByUserId(demoUser.getId())).thenReturn(Optional.of(portfolio));
        when(trackedStockRepository.findByTicker("AAPL")).thenReturn(Optional.of(tracked));
        when(trackedStockRepository.save(tracked)).thenReturn(tracked);

        DemoSession session = demoSessionService.createSession(demoUser);

        assertEquals(3, tracked.getHolderCount());
        assertTrue(session.getSessionTrackedTickers().contains("AAPL"));
        verify(trackedStockRepository).save(tracked);
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
        assertTrue(session.getSessionTrackedTickers().contains("TSLA"));
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
        session.getSessionTrackedTickers().add("MSFT");

        Stock stock = new Stock("MSFT", Instant.now(), 400.0, 395.0, 390.0, 405.0, 394.0, Stock.StockType.INITIAL, Instant.now());
        TrackedStock tracked = new TrackedStock("MSFT");
        tracked.setHolderCount(2);
        when(stockService.updateStockData("MSFT", Stock.StockType.INITIAL)).thenReturn(stock);
        when(trackedStockRepository.findByTicker("MSFT")).thenReturn(Optional.of(tracked));
        when(trackedStockRepository.save(tracked)).thenReturn(tracked);

        demoSessionService.removeHolding(session, demoUser, "MSFT", null, null);

        assertEquals(1, tracked.getHolderCount());
        assertFalse(session.getSessionTrackedTickers().contains("MSFT"));
        verify(trackedStockRepository).save(tracked);
        verify(trackedStockRepository, never()).delete(any(TrackedStock.class));
    }

    @Test
    void stopTrackingStockForSessionOnlyActsOnTrackedTickers() {
        DemoSession session = new DemoSession();
        session.getSessionTrackedTickers().add("TSLA");
        TrackedStock tracked = new TrackedStock("TSLA");
        tracked.setHolderCount(1);
        when(trackedStockRepository.findByTicker("TSLA")).thenReturn(Optional.of(tracked));

        demoSessionService.stopTrackingStockForSession(session, "TSLA");

        assertEquals(0, tracked.getHolderCount());
        verify(trackedStockRepository).delete(tracked);
        assertFalse(session.getSessionTrackedTickers().contains("TSLA"));
    }

    @Test
    void stopTrackingStockForSessionIgnoresUntrackedTickers() {
        DemoSession session = new DemoSession();

        demoSessionService.stopTrackingStockForSession(session, "GME");

        verifyNoInteractions(trackedStockRepository);
    }
}
