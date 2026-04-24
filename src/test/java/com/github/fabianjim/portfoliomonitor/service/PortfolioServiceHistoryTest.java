package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.dto.PortfolioHistoryDTO;
import com.github.fabianjim.portfoliomonitor.model.Holding;
import com.github.fabianjim.portfoliomonitor.model.JournalEntry;
import com.github.fabianjim.portfoliomonitor.model.JournalEntryType;
import com.github.fabianjim.portfoliomonitor.model.Portfolio;
import com.github.fabianjim.portfoliomonitor.model.Stock;
import com.github.fabianjim.portfoliomonitor.model.Transaction;
import com.github.fabianjim.portfoliomonitor.model.User;
import com.github.fabianjim.portfoliomonitor.repository.JournalEntryRepository;
import com.github.fabianjim.portfoliomonitor.repository.PortfolioRepository;
import com.github.fabianjim.portfoliomonitor.repository.StockRepository;
import com.github.fabianjim.portfoliomonitor.repository.TrackedStockRepository;
import com.github.fabianjim.portfoliomonitor.repository.UserRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class PortfolioServiceHistoryTest {

    @Mock
    private PortfolioRepository portfolioRepository;

    @Mock
    private StockRepository stockRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private TrackedStockRepository trackedStockRepository;

    @Mock
    private StockService stockService;

    @Mock
    private TransactionService transactionService;

    @Mock
    private JournalEntryRepository journalEntryRepository;

    @Mock
    private SecurityContext securityContext;

    @Mock
    private Authentication authentication;

    @InjectMocks
    private PortfolioService portfolioService;

    private User mockUser;
    private Portfolio mockPortfolio;

    @BeforeEach
    void setUp() {
        mockUser = new User();
        mockUser.setId(1);
        mockUser.setUsername("testuser");

        mockPortfolio = new Portfolio();
        mockPortfolio.setId(1);
        mockPortfolio.setUser(mockUser);
        mockPortfolio.setHoldings(new ArrayList<>());

        SecurityContextHolder.setContext(securityContext);
        when(securityContext.getAuthentication()).thenReturn(authentication);
        when(authentication.getPrincipal()).thenReturn(mockUser);
    }

    @Test
    void getPortfolioHistoryEmptyPortfolio() {
        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.of(mockPortfolio));

        List<PortfolioHistoryDTO> result = portfolioService.getPortfolioHistory();

        assertTrue(result.isEmpty());
    }

    @Test
    void getPortfolioHistorySingleHolding() {
        Instant now = Instant.now();
        Holding holding = new Holding("AAPL", 10.0);
        holding.setBuyTimestamp(now.minus(1, ChronoUnit.DAYS));
        mockPortfolio.getHoldings().add(holding);

        List<Stock> stockHistory = List.of(
            createStock("AAPL", now.minus(2, ChronoUnit.HOURS), 150.0),
            createStock("AAPL", now.minus(1, ChronoUnit.HOURS), 155.0),
            createStock("AAPL", now, 160.0)
        );

        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockRepository.findByTickerOrderByTimestampDesc("AAPL")).thenReturn(stockHistory);
        when(transactionService.getTransactionHistory()).thenReturn(Collections.emptyList());
        when(journalEntryRepository.findByUserIdOrderByTimestampDesc(1)).thenReturn(Collections.emptyList());

        List<PortfolioHistoryDTO> result = portfolioService.getPortfolioHistory();

        assertEquals(3, result.size());
        assertEquals(1500.0, result.get(0).getPortfolioValue(), 0.01);
        assertEquals(1550.0, result.get(1).getPortfolioValue(), 0.01);
        assertEquals(1600.0, result.get(2).getPortfolioValue(), 0.01);
    }

    @Test
    void getPortfolioHistoryMultipleHoldings() {
        Instant now = Instant.now();
        Holding aaplHolding = new Holding("AAPL", 10.0);
        aaplHolding.setBuyTimestamp(now.minus(1, ChronoUnit.DAYS));
        Holding googlHolding = new Holding("GOOGL", 5.0);
        googlHolding.setBuyTimestamp(now.minus(1, ChronoUnit.DAYS));
        
        mockPortfolio.getHoldings().add(aaplHolding);
        mockPortfolio.getHoldings().add(googlHolding);

        Instant timestamp1 = now.minus(2, ChronoUnit.HOURS);
        Instant timestamp2 = now.minus(1, ChronoUnit.HOURS);

        List<Stock> aaplHistory = List.of(
            createStock("AAPL", timestamp1, 150.0),
            createStock("AAPL", timestamp2, 155.0)
        );

        List<Stock> googlHistory = List.of(
            createStock("GOOGL", timestamp1, 200.0),
            createStock("GOOGL", timestamp2, 205.0)
        );

        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockRepository.findByTickerOrderByTimestampDesc("AAPL")).thenReturn(aaplHistory);
        when(stockRepository.findByTickerOrderByTimestampDesc("GOOGL")).thenReturn(googlHistory);
        when(transactionService.getTransactionHistory()).thenReturn(Collections.emptyList());
        when(journalEntryRepository.findByUserIdOrderByTimestampDesc(1)).thenReturn(Collections.emptyList());

        List<PortfolioHistoryDTO> result = portfolioService.getPortfolioHistory();

        assertEquals(2, result.size());
        assertEquals(2500.0, result.get(0).getPortfolioValue(), 0.01);
        assertEquals(2575.0, result.get(1).getPortfolioValue(), 0.01);
    }

    @Test
    void getPortfolioHistoryMissingPriceDataIncludesPartial() {
        Instant now = Instant.now();
        Holding aaplHolding = new Holding("AAPL", 10.0);
        aaplHolding.setBuyTimestamp(now.minus(1, ChronoUnit.DAYS));
        Holding googlHolding = new Holding("GOOGL", 5.0);
        googlHolding.setBuyTimestamp(now.minus(1, ChronoUnit.DAYS));
        
        mockPortfolio.getHoldings().add(aaplHolding);
        mockPortfolio.getHoldings().add(googlHolding);

        Instant timestamp1 = now.minus(2, ChronoUnit.HOURS);
        Instant timestamp2 = now.minus(1, ChronoUnit.HOURS);

        List<Stock> aaplHistory = List.of(
            createStock("AAPL", timestamp1, 150.0),
            createStock("AAPL", timestamp2, 155.0)
        );

        List<Stock> googlHistory = List.of(
            createStock("GOOGL", timestamp2, 205.0)
        );

        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockRepository.findByTickerOrderByTimestampDesc("AAPL")).thenReturn(aaplHistory);
        when(stockRepository.findByTickerOrderByTimestampDesc("GOOGL")).thenReturn(googlHistory);
        when(transactionService.getTransactionHistory()).thenReturn(Collections.emptyList());
        when(journalEntryRepository.findByUserIdOrderByTimestampDesc(1)).thenReturn(Collections.emptyList());

        List<PortfolioHistoryDTO> result = portfolioService.getPortfolioHistory();

        // Should include both timestamps with partial data for timestamp1
        assertEquals(2, result.size());
        assertEquals(timestamp1, result.get(0).getTimestamp());
        assertEquals(1500.0, result.get(0).getPortfolioValue(), 0.01); // Only AAPL: 150 * 10
        assertEquals(timestamp2, result.get(1).getTimestamp());
        assertEquals(2575.0, result.get(1).getPortfolioValue(), 0.01); // Both: 155 * 10 + 205 * 5
    }

    @Test
    void getPortfolioHistoryIncludesEODData() {
        Instant now = Instant.now();
        Holding holding = new Holding("AAPL", 10.0);
        holding.setBuyTimestamp(now.minus(1, ChronoUnit.DAYS));
        mockPortfolio.getHoldings().add(holding);

        Instant eodTime = now.minus(4, ChronoUnit.HOURS);
        List<Stock> stockHistory = List.of(
            createStock("AAPL", now.minus(2, ChronoUnit.HOURS), 150.0, Stock.StockType.INTRADAY),
            createStock("AAPL", eodTime, 145.0, Stock.StockType.EOD)
        );

        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockRepository.findByTickerOrderByTimestampDesc("AAPL")).thenReturn(stockHistory);
        when(transactionService.getTransactionHistory()).thenReturn(Collections.emptyList());
        when(journalEntryRepository.findByUserIdOrderByTimestampDesc(1)).thenReturn(Collections.emptyList());

        List<PortfolioHistoryDTO> result = portfolioService.getPortfolioHistory();

        // Should include both INTRADAY and EOD
        assertEquals(2, result.size());
        assertEquals(1450.0, result.get(0).getPortfolioValue(), 0.01); // EOD: 145 * 10
        assertEquals(1500.0, result.get(1).getPortfolioValue(), 0.01); // Intraday: 150 * 10
    }

    @Test
    void getPortfolioHistoryWithJournalMarkersDuringTradingHours() {
        // Create a trading hours timestamp (2 PM ET)
        ZonedDateTime tradingTime = ZonedDateTime.of(2024, 1, 15, 14, 20, 0, 0, ZoneId.of("America/New_York"));
        Instant tradeInstant = tradingTime.toInstant();
        
        Holding holding = new Holding("AAPL", 10.0);
        holding.setBuyTimestamp(tradeInstant.minus(1, ChronoUnit.DAYS));
        mockPortfolio.getHoldings().add(holding);

        List<Stock> stockHistory = List.of(
            createStock("AAPL", tradeInstant.minus(30, ChronoUnit.MINUTES), 150.0),
            createStock("AAPL", tradeInstant.plus(30, ChronoUnit.MINUTES), 155.0)
        );

        Transaction initialTransaction = new Transaction("AAPL", 10.0, 150.0, Transaction.TransactionType.BUY);
        initialTransaction.setTimestamp(tradeInstant.minus(1, ChronoUnit.DAYS));
        initialTransaction.setTotalValue(1500.0);

        Transaction buyTransaction = new Transaction("AAPL", 5.0, 150.0, Transaction.TransactionType.BUY);
        buyTransaction.setTimestamp(tradeInstant);
        buyTransaction.setTotalValue(750.0);

        JournalEntry journalEntry = new JournalEntry();
        journalEntry.setId(42);
        journalEntry.setEntryType(JournalEntryType.BUY);
        journalEntry.setTicker("AAPL");
        journalEntry.setTimestamp(tradeInstant);

        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockRepository.findByTickerOrderByTimestampDesc("AAPL")).thenReturn(stockHistory);
        when(transactionService.getTransactionHistory()).thenReturn(List.of(initialTransaction, buyTransaction));
        when(journalEntryRepository.findByUserIdOrderByTimestampDesc(1)).thenReturn(List.of(journalEntry));

        List<PortfolioHistoryDTO> result = portfolioService.getPortfolioHistory();

        // Should have 3 points: 2 history + 1 marker
        assertEquals(3, result.size());
        
        // Find the marker
        PortfolioHistoryDTO marker = result.stream()
            .filter(PortfolioHistoryDTO::isMarker)
            .findFirst()
            .orElse(null);
        
        assertNotNull(marker);
        assertEquals("BUY", marker.getMarkerType());
        assertEquals(42, marker.getJournalEntryId());
        // Portfolio was 1500 before, add 750 for buy = 2250
        assertEquals(2250.0, marker.getPortfolioValue(), 0.01);
    }

    @Test
    void getPortfolioHistoryAfterHoursBuyDoesNotBreakGraph() {
        // Create after-hours timestamp (6 PM ET)
        ZonedDateTime afterHours = ZonedDateTime.of(2024, 1, 15, 18, 0, 0, 0, ZoneId.of("America/New_York"));
        Instant afterHoursInstant = afterHours.toInstant();
        
        Holding aaplHolding = new Holding("AAPL", 10.0);
        aaplHolding.setBuyTimestamp(afterHoursInstant.minus(1, ChronoUnit.DAYS));
        // New holding bought after hours
        Holding msftHolding = new Holding("MSFT", 5.0);
        msftHolding.setBuyTimestamp(afterHoursInstant);
        
        mockPortfolio.getHoldings().add(aaplHolding);
        mockPortfolio.getHoldings().add(msftHolding);

        // AAPL has data but MSFT has none (bought after hours, no fetch yet)
        List<Stock> aaplHistory = List.of(
            createStock("AAPL", afterHoursInstant.minus(2, ChronoUnit.HOURS), 150.0),
            createStock("AAPL", afterHoursInstant.minus(1, ChronoUnit.HOURS), 155.0)
        );

        Transaction buyTransaction = new Transaction("MSFT", 5.0, 200.0, Transaction.TransactionType.BUY);
        buyTransaction.setTimestamp(afterHoursInstant);
        buyTransaction.setTotalValue(1000.0);

        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockRepository.findByTickerOrderByTimestampDesc("AAPL")).thenReturn(aaplHistory);
        when(stockRepository.findByTickerOrderByTimestampDesc("MSFT")).thenReturn(Collections.emptyList());
        when(transactionService.getTransactionHistory()).thenReturn(List.of(buyTransaction));
        when(journalEntryRepository.findByUserIdOrderByTimestampDesc(1)).thenReturn(Collections.emptyList());

        List<PortfolioHistoryDTO> result = portfolioService.getPortfolioHistory();

        // Should still return history for AAPL, MSFT should not break it
        assertEquals(2, result.size());
        assertEquals(1500.0, result.get(0).getPortfolioValue(), 0.01); // 150 * 10
        assertEquals(1550.0, result.get(1).getPortfolioValue(), 0.01); // 155 * 10
    }

    @Test
    void getPortfolioHistoryFiltersByBuyTimestamp() {
        Instant now = Instant.now();
        Holding holding = new Holding("AAPL", 10.0);
        holding.setBuyTimestamp(now.minus(3, ChronoUnit.HOURS));
        mockPortfolio.getHoldings().add(holding);

        List<Stock> stockHistory = List.of(
            createStock("AAPL", now.minus(5, ChronoUnit.HOURS), 140.0),
            createStock("AAPL", now.minus(4, ChronoUnit.HOURS), 145.0),
            createStock("AAPL", now.minus(2, ChronoUnit.HOURS), 150.0),
            createStock("AAPL", now, 160.0)
        );

        Transaction buyTransaction = new Transaction("AAPL", 10.0, 150.0, Transaction.TransactionType.BUY);
        buyTransaction.setTimestamp(now.minus(3, ChronoUnit.HOURS));
        buyTransaction.setTotalValue(1500.0);

        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockRepository.findByTickerOrderByTimestampDesc("AAPL")).thenReturn(stockHistory);
        when(transactionService.getTransactionHistory()).thenReturn(List.of(buyTransaction));
        when(journalEntryRepository.findByUserIdOrderByTimestampDesc(1)).thenReturn(Collections.emptyList());

        List<PortfolioHistoryDTO> result = portfolioService.getPortfolioHistory();

        // Should include all 4 points since AAPL existed before the buy (it's the same ticker)
        // Actually with transaction replay, the holding didn't exist before buy time
        assertEquals(2, result.size());
        assertEquals(1500.0, result.get(0).getPortfolioValue(), 0.01);
        assertEquals(1600.0, result.get(1).getPortfolioValue(), 0.01);
    }

    @Test
    void getPortfolioHistoryNoPortfolioReturnsEmptyList() {
        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.empty());

        List<PortfolioHistoryDTO> result = portfolioService.getPortfolioHistory();
        assertTrue(result.isEmpty());
    }

    private Stock createStock(String ticker, Instant timestamp, double price) {
        return createStock(ticker, timestamp, price, Stock.StockType.INTRADAY);
    }

    private Stock createStock(String ticker, Instant timestamp, double price, Stock.StockType type) {
        Stock stock = new Stock();
        stock.setTicker(ticker);
        stock.setTimestamp(timestamp);
        stock.setHourBucket(timestamp);
        stock.setCurrentPrice(price);
        stock.setOpen(price);
        stock.setPrevClose(price);
        stock.setHigh(price);
        stock.setLow(price);
        stock.setType(type);
        return stock;
    }
}
