package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.dto.PortfolioHistoryDTO;
import com.github.fabianjim.portfoliomonitor.model.Holding;
import com.github.fabianjim.portfoliomonitor.model.Portfolio;
import com.github.fabianjim.portfoliomonitor.model.Stock;
import com.github.fabianjim.portfoliomonitor.model.Transaction;
import com.github.fabianjim.portfoliomonitor.model.Transaction.TransactionType;
import com.github.fabianjim.portfoliomonitor.model.User;
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
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
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
    private JournalEntryService journalEntryService;

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

    // no holdings returns empty history
    @Test
    void getPortfolioHistoryEmptyPortfolio() {
        
        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.of(mockPortfolio));

        
        List<PortfolioHistoryDTO> result = portfolioService.getPortfolioHistory();

        
        assertTrue(result.isEmpty());
    }

    // one holding, mock hourly price data and check value at each hour
    @Test
    void getPortfolioHistorySingleHolding() {
        
        Instant now = Instant.now();
        Holding holding = new Holding("AAPL", 10.0);
        holding.setBuyTimestamp(now.minus(1, ChronoUnit.DAYS));
        mockPortfolio.getHoldings().add(holding);

        // 
        List<Stock> stockHistory = List.of(
            createStock("AAPL", now.minus(2, ChronoUnit.HOURS), 150.0),
            createStock("AAPL", now.minus(1, ChronoUnit.HOURS), 155.0),
            createStock("AAPL", now, 160.0)
        );

        List<Transaction> transactions = List.of(
            createTransaction("AAPL", 10.0, 150.0, TransactionType.BUY, now.minus(1, ChronoUnit.DAYS))
        );

        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockRepository.findByTickerOrderByTimestampDesc("AAPL")).thenReturn(stockHistory);
        when(transactionService.getTransactionHistory()).thenReturn(transactions);

        
        List<PortfolioHistoryDTO> result = portfolioService.getPortfolioHistory();

        
        assertEquals(3, result.size());
        assertEquals(1500.0, result.get(0).getPortfolioValue(), 0.01); // Oldest: 150 * 10
        assertEquals(1550.0, result.get(1).getPortfolioValue(), 0.01); // Middle: 155 * 10
        assertEquals(1600.0, result.get(2).getPortfolioValue(), 0.01); // Newest: 160 * 10
    }

    // multiple holdings, mock hourly data for each
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

        List<Transaction> transactions = List.of(
            createTransaction("AAPL", 10.0, 150.0, TransactionType.BUY, now.minus(1, ChronoUnit.DAYS)),
            createTransaction("GOOGL", 5.0, 200.0, TransactionType.BUY, now.minus(1, ChronoUnit.DAYS))
        );

        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockRepository.findByTickerOrderByTimestampDesc("AAPL")).thenReturn(aaplHistory);
        when(stockRepository.findByTickerOrderByTimestampDesc("GOOGL")).thenReturn(googlHistory);
        when(transactionService.getTransactionHistory()).thenReturn(transactions);

        
        List<PortfolioHistoryDTO> result = portfolioService.getPortfolioHistory();

        
        assertEquals(2, result.size());
        // First timestamp: 150 * 10 + 200 * 5 = 2500
        assertEquals(2500.0, result.get(0).getPortfolioValue(), 0.01);
        // Second timestamp: 155 * 10 + 205 * 5 = 1550 + 1025 = 2575
        assertEquals(2575.0, result.get(1).getPortfolioValue(), 0.01);
    }

    // multiple holdings, mock hourly data but one stock misses a timestamp
    @Test
    void getPortfolioHistoryMissingPriceData() {
        
        Instant now = Instant.now();
        Holding aaplHolding = new Holding("AAPL", 10.0);
        aaplHolding.setBuyTimestamp(now.minus(1, ChronoUnit.DAYS));
        Holding googlHolding = new Holding("GOOGL", 5.0);
        googlHolding.setBuyTimestamp(now.minus(1, ChronoUnit.DAYS));
        
        mockPortfolio.getHoldings().add(aaplHolding);
        mockPortfolio.getHoldings().add(googlHolding);

        Instant timestamp1 = now.minus(2, ChronoUnit.HOURS);
        Instant timestamp2 = now.minus(1, ChronoUnit.HOURS);

        // AAPL has data for both timestamps
        List<Stock> aaplHistory = List.of(
            createStock("AAPL", timestamp1, 150.0),
            createStock("AAPL", timestamp2, 155.0)
        );

        // GOOGL only has data for timestamp2 (missing timestamp1)
        List<Stock> googlHistory = List.of(
            createStock("GOOGL", timestamp2, 205.0)
        );

        List<Transaction> transactions = List.of(
            createTransaction("AAPL", 10.0, 150.0, TransactionType.BUY, now.minus(1, ChronoUnit.DAYS)),
            createTransaction("GOOGL", 5.0, 200.0, TransactionType.BUY, now.minus(1, ChronoUnit.DAYS))
        );

        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockRepository.findByTickerOrderByTimestampDesc("AAPL")).thenReturn(aaplHistory);
        when(stockRepository.findByTickerOrderByTimestampDesc("GOOGL")).thenReturn(googlHistory);
        when(transactionService.getTransactionHistory()).thenReturn(transactions);

        
        List<PortfolioHistoryDTO> result = portfolioService.getPortfolioHistory();

        // should only include timestamp2 where both stocks have data
        assertEquals(1, result.size());
        assertEquals(timestamp2, result.get(0).getTimestamp());
        assertEquals(2575.0, result.get(0).getPortfolioValue(), 0.01);
    }

    // filter history to only include data from buy timestamp onward
    @Test
    void getPortfolioHistoryFiltersByBuyTimestamp() {
        
        Instant now = Instant.now();
        Holding holding = new Holding("AAPL", 10.0);
        holding.setBuyTimestamp(now.minus(3, ChronoUnit.HOURS)); // Bought 3 hours ago
        mockPortfolio.getHoldings().add(holding);

        List<Stock> stockHistory = List.of(

            // before buy time
            createStock("AAPL", now.minus(5, ChronoUnit.HOURS), 140.0),
            createStock("AAPL", now.minus(4, ChronoUnit.HOURS), 145.0), 
            
            // after buy, these are included
            createStock("AAPL", now.minus(2, ChronoUnit.HOURS), 150.0), 
            createStock("AAPL", now, 160.0)
        );

        List<Transaction> transactions = List.of(
            createTransaction("AAPL", 10.0, 150.0, TransactionType.BUY, now.minus(3, ChronoUnit.HOURS))
        );

        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockRepository.findByTickerOrderByTimestampDesc("AAPL")).thenReturn(stockHistory);
        when(transactionService.getTransactionHistory()).thenReturn(transactions);

        
        List<PortfolioHistoryDTO> result = portfolioService.getPortfolioHistory();

        // check scale vals on ui if fails
        assertEquals(2, result.size());
        assertEquals(1500.0, result.get(0).getPortfolioValue(), 0.01); // 150 * 10
        assertEquals(1600.0, result.get(1).getPortfolioValue(), 0.01); // 160 * 10
    }

    @Test
    void getPortfolioHistoryNoPortfolioReturnsEmptyList() {
        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.empty());
        List<PortfolioHistoryDTO> result = portfolioService.getPortfolioHistory();
        assertTrue(result.isEmpty());
    }

    // after-hours buy should not wipe existing intraday history
    @Test
    void getPortfolioHistoryAfterHoursBuyPreservesExistingData() {
        // Simulate a trading day with fixed timestamps
        Instant tenAm = Instant.parse("2025-01-15T15:00:00Z");  // 10:00 AM EST
        Instant elevenAm = Instant.parse("2025-01-15T16:00:00Z"); // 11:00 AM EST
        Instant fourPm = Instant.parse("2025-01-15T21:00:00Z");   // 4:00 PM EST
        Instant ninePm = Instant.parse("2025-01-16T02:00:00Z");   // 9:00 PM EST (after hours)

        // AAPL bought yesterday
        Holding aaplHolding = new Holding("AAPL", 10.0);
        aaplHolding.setBuyTimestamp(tenAm.minus(1, ChronoUnit.DAYS));

        // GRAB bought at 9pm today (after hours)
        Holding grabHolding = new Holding("GRAB", 5.0);
        grabHolding.setBuyTimestamp(ninePm);

        mockPortfolio.getHoldings().add(aaplHolding);
        mockPortfolio.getHoldings().add(grabHolding);

        // AAPL has intraday data at 10am, 11am, 4pm
        List<Stock> aaplHistory = List.of(
            createStock("AAPL", tenAm, 150.0),
            createStock("AAPL", elevenAm, 155.0),
            createStock("AAPL", fourPm, 160.0)
        );

        // GRAB only has INITIAL data at 9pm (after hours)
        Stock grabStock = createStock("GRAB", ninePm, 20.0);
        grabStock.setType(Stock.StockType.INITIAL);
        List<Stock> grabHistory = List.of(grabStock);

        List<Transaction> transactions = List.of(
            createTransaction("AAPL", 10.0, 150.0, TransactionType.BUY, tenAm.minus(1, ChronoUnit.DAYS)),
            createTransaction("GRAB", 5.0, 20.0, TransactionType.BUY, ninePm)
        );

        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockRepository.findByTickerOrderByTimestampDesc("AAPL")).thenReturn(aaplHistory);
        when(stockRepository.findByTickerOrderByTimestampDesc("GRAB")).thenReturn(grabHistory);
        when(transactionService.getTransactionHistory()).thenReturn(transactions);

        List<PortfolioHistoryDTO> result = portfolioService.getPortfolioHistory();

        // Should return 10am, 11am, 4pm data (AAPL only, since GRAB didn't exist then)
        // Should NOT return empty list
        assertFalse(result.isEmpty(), "After-hours buy should not wipe existing intraday history");
        assertEquals(3, result.size());

        // 10am: AAPL only = 150 * 10 = 1500
        assertEquals(1500.0, result.get(0).getPortfolioValue(), 0.01);
        assertEquals(tenAm, result.get(0).getTimestamp());

        // 11am: AAPL only = 155 * 10 = 1550
        assertEquals(1550.0, result.get(1).getPortfolioValue(), 0.01);
        assertEquals(elevenAm, result.get(1).getTimestamp());

        // 4pm: AAPL only = 160 * 10 = 1600
        assertEquals(1600.0, result.get(2).getPortfolioValue(), 0.01);
        assertEquals(fourPm, result.get(2).getTimestamp());
    }

    // intraday buy should show pre-buy and post-buy history correctly
    @Test
    void getPortfolioHistoryIntradayBuyShowsCorrectValues() {
        // Simulate a trading day with fixed timestamps
        Instant tenAm = Instant.parse("2025-01-15T15:00:00Z");  // 10:00 AM EST
        Instant elevenAm = Instant.parse("2025-01-15T16:00:00Z"); // 11:00 AM EST
        Instant onePm = Instant.parse("2025-01-15T18:00:00Z");    // 1:00 PM EST
        Instant twoPm = Instant.parse("2025-01-15T19:00:00Z");    // 2:00 PM EST

        // AAPL bought yesterday
        Holding aaplHolding = new Holding("AAPL", 10.0);
        aaplHolding.setBuyTimestamp(tenAm.minus(1, ChronoUnit.DAYS));

        // GRAB bought at 1:17pm (rounds to 1:00 PM hour bucket)
        Holding grabHolding = new Holding("GRAB", 5.0);
        grabHolding.setBuyTimestamp(onePm.plus(17, ChronoUnit.MINUTES));

        mockPortfolio.getHoldings().add(aaplHolding);
        mockPortfolio.getHoldings().add(grabHolding);

        // AAPL has data at 10am, 11am, 1pm, 2pm
        List<Stock> aaplHistory = List.of(
            createStock("AAPL", tenAm, 150.0),
            createStock("AAPL", elevenAm, 155.0),
            createStock("AAPL", onePm, 152.0),
            createStock("AAPL", twoPm, 158.0)
        );

        // GRAB has INITIAL data at 1pm (buy time rounds to 1:00) and INTRADAY at 2pm
        Stock grabInitial = createStock("GRAB", onePm.plus(17, ChronoUnit.MINUTES), 20.0);
        grabInitial.setType(Stock.StockType.INITIAL);
        grabInitial.setHourBucket(onePm); // hour bucket rounds to 1pm
        Stock grabIntraday = createStock("GRAB", twoPm, 21.0);
        List<Stock> grabHistory = List.of(grabInitial, grabIntraday);

        List<Transaction> transactions = List.of(
            createTransaction("AAPL", 10.0, 150.0, TransactionType.BUY, tenAm.minus(1, ChronoUnit.DAYS)),
            createTransaction("GRAB", 5.0, 20.0, TransactionType.BUY, onePm.plus(17, ChronoUnit.MINUTES))
        );

        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockRepository.findByTickerOrderByTimestampDesc("AAPL")).thenReturn(aaplHistory);
        when(stockRepository.findByTickerOrderByTimestampDesc("GRAB")).thenReturn(grabHistory);
        when(transactionService.getTransactionHistory()).thenReturn(transactions);

        List<PortfolioHistoryDTO> result = portfolioService.getPortfolioHistory();

        // Should return 10am, 11am, 1pm, 2pm
        // 10am and 11am: AAPL only (GRAB didn't exist yet)
        // 1pm: AAPL only (GRAB bought at 1:17pm, after 1pm hour bucket)
        // 2pm: AAPL + GRAB (GRAB existed at 2pm)
        assertEquals(4, result.size());

        // 10am: AAPL only = 150 * 10 = 1500
        assertEquals(1500.0, result.get(0).getPortfolioValue(), 0.01);
        assertEquals(tenAm, result.get(0).getTimestamp());

        // 11am: AAPL only = 155 * 10 = 1550
        assertEquals(1550.0, result.get(1).getPortfolioValue(), 0.01);
        assertEquals(elevenAm, result.get(1).getTimestamp());

        // 1pm: AAPL only = 152 * 10 = 1520 (GRAB not active yet at 1pm)
        assertEquals(1520.0, result.get(2).getPortfolioValue(), 0.01);
        assertEquals(onePm, result.get(2).getTimestamp());

        // 2pm: AAPL + GRAB = (158 * 10) + (21 * 5) = 1580 + 105 = 1685
        assertEquals(1685.0, result.get(3).getPortfolioValue(), 0.01);
        assertEquals(twoPm, result.get(3).getTimestamp());
    }

    // regression test: multiple buys of same ticker should show correct shares-at-time
    @Test
    void getPortfolioHistoryMultipleBuysSameTicker() {
        Instant day1 = Instant.parse("2025-01-13T15:00:00Z"); // Monday 10am
        Instant day2 = Instant.parse("2025-01-14T15:00:00Z"); // Tuesday 10am
        Instant day3 = Instant.parse("2025-01-15T15:00:00Z"); // Wednesday 10am

        Holding spyHolding = new Holding("SPY", 3.0);
        spyHolding.setBuyTimestamp(day1);
        mockPortfolio.getHoldings().add(spyHolding);

        List<Stock> spyHistory = List.of(
            createStock("SPY", day1, 100.0),
            createStock("SPY", day2, 110.0),
            createStock("SPY", day3, 120.0)
        );

        List<Transaction> transactions = List.of(
            createTransaction("SPY", 1.0, 100.0, TransactionType.BUY, day1),
            createTransaction("SPY", 1.0, 110.0, TransactionType.BUY, day2),
            createTransaction("SPY", 1.0, 120.0, TransactionType.BUY, day3)
        );

        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockRepository.findByTickerOrderByTimestampDesc("SPY")).thenReturn(spyHistory);
        when(transactionService.getTransactionHistory()).thenReturn(transactions);

        List<PortfolioHistoryDTO> result = portfolioService.getPortfolioHistory();

        assertEquals(3, result.size());

        // Day 1: 1 share @ $100 = $100
        assertEquals(100.0, result.get(0).getPortfolioValue(), 0.01);
        assertEquals(day1, result.get(0).getTimestamp());

        // Day 2: 2 shares @ $110 = $220
        assertEquals(220.0, result.get(1).getPortfolioValue(), 0.01);
        assertEquals(day2, result.get(1).getTimestamp());

        // Day 3: 3 shares @ $120 = $360
        assertEquals(360.0, result.get(2).getPortfolioValue(), 0.01);
        assertEquals(day3, result.get(2).getTimestamp());
    }

    // regression test: portfolio creation at mid-hour shows exact timestamp, not rounded
    @Test
    void getPortfolioHistoryPortfolioCreationUsesExactTimestamp() {
        // Simulate portfolio created at 3:53 PM EST
        Instant threeFiftyThreePm = Instant.parse("2025-01-15T20:53:00Z"); // 3:53 PM EST

        Holding nvdaHolding = new Holding("NVDA", 3.0);
        nvdaHolding.setBuyTimestamp(threeFiftyThreePm);

        Holding vooHolding = new Holding("VOO", 2.0);
        vooHolding.setBuyTimestamp(threeFiftyThreePm);

        Holding snowHolding = new Holding("SNOW", 3.0);
        snowHolding.setBuyTimestamp(threeFiftyThreePm);

        mockPortfolio.getHoldings().add(nvdaHolding);
        mockPortfolio.getHoldings().add(vooHolding);
        mockPortfolio.getHoldings().add(snowHolding);

        // Stock data with exact timestamp (not rounded to 4:00 PM)
        // This simulates INITIAL fetch behavior where hourBucket = exact timestamp
        Stock nvdaStock = createStock("NVDA", threeFiftyThreePm, 213.89);
        nvdaStock.setType(Stock.StockType.INITIAL);
        Stock vooStock = createStock("VOO", threeFiftyThreePm, 693.91);
        vooStock.setType(Stock.StockType.INITIAL);
        Stock snowStock = createStock("SNOW", threeFiftyThreePm, 239.54);
        snowStock.setType(Stock.StockType.INITIAL);

        List<Stock> nvdaHistory = List.of(nvdaStock);
        List<Stock> vooHistory = List.of(vooStock);
        List<Stock> snowHistory = List.of(snowStock);

        // Total: (3 * 213.89) + (2 * 693.91) + (3 * 239.54) = 4245.34
        double expectedValue = (3.0 * 213.89) + (2.0 * 693.91) + (3.0 * 239.54);

        List<Transaction> transactions = List.of(
            createTransaction("NVDA", 3.0, 213.89, TransactionType.BUY, threeFiftyThreePm),
            createTransaction("VOO", 2.0, 693.91, TransactionType.BUY, threeFiftyThreePm),
            createTransaction("SNOW", 3.0, 239.54, TransactionType.BUY, threeFiftyThreePm)
        );

        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockRepository.findByTickerOrderByTimestampDesc("NVDA")).thenReturn(nvdaHistory);
        when(stockRepository.findByTickerOrderByTimestampDesc("VOO")).thenReturn(vooHistory);
        when(stockRepository.findByTickerOrderByTimestampDesc("SNOW")).thenReturn(snowHistory);
        when(transactionService.getTransactionHistory()).thenReturn(transactions);

        List<PortfolioHistoryDTO> result = portfolioService.getPortfolioHistory();

        // Should have exactly 1 data point at 3:53 PM, not rounded to 4:00 PM
        assertEquals(1, result.size());
        assertEquals(threeFiftyThreePm, result.get(0).getTimestamp());
        assertEquals(expectedValue, result.get(0).getPortfolioValue(), 0.01);
    }

    private Stock createStock(String ticker, Instant timestamp, double price) {
        Stock stock = new Stock();
        stock.setTicker(ticker);
        stock.setTimestamp(timestamp);
        stock.setHourBucket(timestamp); // For test data, hour bucket matches timestamp
        stock.setCurrentPrice(price);
        stock.setOpen(price);
        stock.setPrevClose(price);
        stock.setHigh(price);
        stock.setLow(price);
        stock.setType(Stock.StockType.INTRADAY);
        return stock;
    }

    private Transaction createTransaction(String ticker, double shares, double price, TransactionType type, Instant timestamp) {
        Transaction tx = new Transaction(ticker, shares, price, type);
        tx.setTimestamp(timestamp);
        tx.setId(1);
        return tx;
    }
}
