package com.github.fabianjim.portfoliomonitor.service;

// troi oi
import com.github.fabianjim.portfoliomonitor.dto.PortfolioHistoryDTO;
import com.github.fabianjim.portfoliomonitor.model.Holding;
import com.github.fabianjim.portfoliomonitor.model.Portfolio;
import com.github.fabianjim.portfoliomonitor.model.Stock;
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

        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockRepository.findByTickerOrderByTimestampDesc("AAPL")).thenReturn(stockHistory);

        
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

        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockRepository.findByTickerOrderByTimestampDesc("AAPL")).thenReturn(aaplHistory);
        when(stockRepository.findByTickerOrderByTimestampDesc("GOOGL")).thenReturn(googlHistory);

        
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

        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockRepository.findByTickerOrderByTimestampDesc("AAPL")).thenReturn(aaplHistory);
        when(stockRepository.findByTickerOrderByTimestampDesc("GOOGL")).thenReturn(googlHistory);

        
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

        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockRepository.findByTickerOrderByTimestampDesc("AAPL")).thenReturn(stockHistory);

        
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
}
