package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.dto.PnLSummaryDTO;
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

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class PortfolioServicePnLTest {

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
        lenient().when(securityContext.getAuthentication()).thenReturn(authentication);
        lenient().when(authentication.getPrincipal()).thenReturn(mockUser);
    }

    @Test
    void getPnLSummary_SingleBuy_UnrealizedPositive() {
        // Bought 10 AAPL at $100, current price $150
        List<Transaction> transactions = List.of(
            createTransaction("AAPL", 10.0, 100.0, TransactionType.BUY)
        );
        when(transactionService.getTransactionHistory()).thenReturn(transactions);
        when(stockService.getLatestStockData("AAPL")).thenReturn(Optional.of(createStock("AAPL", 150.0)));

        
        PnLSummaryDTO result = portfolioService.getPnLSummary();

        // Unrealized: (150 - 100) * 10 = 500, cost basis = 100 * 10 = 1000, % = 50%
        // Total P/L: 500, total cost basis: 1000, % = 50%
        assertEquals(500.0, result.getTotalPnL(), 0.01);
        assertEquals(50.0, result.getTotalPnLPercent(), 0.01);
        assertEquals(500.0, result.getUnrealizedPnL(), 0.01);
        assertEquals(50.0, result.getUnrealizedPnLPercent(), 0.01);
        assertEquals(0.0, result.getRealizedPnL(), 0.01);
        assertEquals(0.0, result.getRealizedPnLPercent(), 0.01);
    }

    @Test
    void getPnLSummary_BuyThenPartialSell_MixedPnL() {
        // Bought 10 AAPL at $100, sold 4 at $150, current price $120
        List<Transaction> transactions = List.of(
            createTransaction("AAPL", 10.0, 100.0, TransactionType.BUY),
            createTransaction("AAPL", 4.0, 150.0, TransactionType.SELL)
        );
        when(transactionService.getTransactionHistory()).thenReturn(transactions);
        when(stockService.getLatestStockData("AAPL")).thenReturn(Optional.of(createStock("AAPL", 120.0)));

        
        PnLSummaryDTO result = portfolioService.getPnLSummary();

        // Avg cost = 100, current shares = 6
        // Unrealized: (120 - 100) * 6 = 120, cost basis = 100 * 6 = 600, % = 20%
        // Realized: (150 * 4) - (100 * 4) = 600 - 400 = 200, sold cost basis = 100 * 4 = 400, % = 50%
        // Total P/L: 320, total cost basis: 1000, % = 32%
        assertEquals(320.0, result.getTotalPnL(), 0.01);
        assertEquals(32.0, result.getTotalPnLPercent(), 0.01);
        assertEquals(120.0, result.getUnrealizedPnL(), 0.01);
        assertEquals(20.0, result.getUnrealizedPnLPercent(), 0.01);
        assertEquals(200.0, result.getRealizedPnL(), 0.01);
        assertEquals(50.0, result.getRealizedPnLPercent(), 0.01);
    }

    @Test
    void getPnLSummary_FullSell_UnrealizedZero_RealizedNonZero() {
        // Bought 10 AAPL at $100, sold all 10 at $150
        List<Transaction> transactions = List.of(
            createTransaction("AAPL", 10.0, 100.0, TransactionType.BUY),
            createTransaction("AAPL", 10.0, 150.0, TransactionType.SELL)
        );
        when(transactionService.getTransactionHistory()).thenReturn(transactions);

        
        PnLSummaryDTO result = portfolioService.getPnLSummary();

        // Unrealized: 0 (no current shares)
        // Realized: (150 * 10) - (100 * 10) = 1500 - 1000 = 500, sold cost basis = 1000, % = 50%
        // Total P/L: 500, total cost basis: 1000, % = 50%
        assertEquals(500.0, result.getTotalPnL(), 0.01);
        assertEquals(50.0, result.getTotalPnLPercent(), 0.01);
        assertEquals(0.0, result.getUnrealizedPnL(), 0.01);
        assertEquals(0.0, result.getUnrealizedPnLPercent(), 0.01);
        assertEquals(500.0, result.getRealizedPnL(), 0.01);
        assertEquals(50.0, result.getRealizedPnLPercent(), 0.01);
    }

    @Test
    void getPnLSummary_MultipleTickers() {
        // AAPL: Bought 10 at $100, current $150 → unrealized 500, % 50
        // GOOGL: Bought 5 at $200, sold 5 at $180 → realized -100, % -10
        List<Transaction> transactions = List.of(
            createTransaction("AAPL", 10.0, 100.0, TransactionType.BUY),
            createTransaction("GOOGL", 5.0, 200.0, TransactionType.BUY),
            createTransaction("GOOGL", 5.0, 180.0, TransactionType.SELL)
        );
        when(transactionService.getTransactionHistory()).thenReturn(transactions);
        when(stockService.getLatestStockData("AAPL")).thenReturn(Optional.of(createStock("AAPL", 150.0)));

        
        PnLSummaryDTO result = portfolioService.getPnLSummary();

        // Total unrealized: 500, cost basis: 1000, %: 50%
        // Total realized: -100, sold cost basis: 1000, %: -10%
        // Total P/L: 400, total cost basis: 2000, %: 20%
        assertEquals(400.0, result.getTotalPnL(), 0.01);
        assertEquals(20.0, result.getTotalPnLPercent(), 0.01);
        assertEquals(500.0, result.getUnrealizedPnL(), 0.01);
        assertEquals(50.0, result.getUnrealizedPnLPercent(), 0.01);
        assertEquals(-100.0, result.getRealizedPnL(), 0.01);
        assertEquals(-10.0, result.getRealizedPnLPercent(), 0.01);
    }

    @Test
    void getPnLSummary_NoTransactions_ZeroPnL() {
        // no transactions
        when(transactionService.getTransactionHistory()).thenReturn(List.of());

        
        PnLSummaryDTO result = portfolioService.getPnLSummary();

        assertEquals(0.0, result.getTotalPnL(), 0.01);
        assertEquals(0.0, result.getTotalPnLPercent(), 0.01);
        assertEquals(0.0, result.getUnrealizedPnL(), 0.01);
        assertEquals(0.0, result.getUnrealizedPnLPercent(), 0.01);
        assertEquals(0.0, result.getRealizedPnL(), 0.01);
        assertEquals(0.0, result.getRealizedPnLPercent(), 0.01);
    }

    @Test
    void getPnLSummary_CurrentPriceUnavailable_ZeroPrice() {
        // Bought 10 AAPL at $100, but no current price data
        List<Transaction> transactions = List.of(
            createTransaction("AAPL", 10.0, 100.0, TransactionType.BUY)
        );
        when(transactionService.getTransactionHistory()).thenReturn(transactions);
        when(stockService.getLatestStockData("AAPL")).thenReturn(Optional.empty());

        
        PnLSummaryDTO result = portfolioService.getPnLSummary();

        // Unrealized: (0 - 100) * 10 = -1000, cost basis: 1000, %: -100%
        // Total P/L: -1000, total cost basis: 1000, %: -100%
        assertEquals(-1000.0, result.getTotalPnL(), 0.01);
        assertEquals(-100.0, result.getTotalPnLPercent(), 0.01);
        assertEquals(-1000.0, result.getUnrealizedPnL(), 0.01);
        assertEquals(-100.0, result.getUnrealizedPnLPercent(), 0.01);
        assertEquals(0.0, result.getRealizedPnL(), 0.01);
        assertEquals(0.0, result.getRealizedPnLPercent(), 0.01);
    }

    private Transaction createTransaction(String ticker, double shares, double price, TransactionType type) {
        Transaction tx = new Transaction(ticker, shares, price, type);
        tx.setId(1);
        return tx;
    }

    private Stock createStock(String ticker, double price) {
        Stock stock = new Stock();
        stock.setTicker(ticker);
        stock.setCurrentPrice(price);
        return stock;
    }
}
