package com.github.fabianjim.portfoliomonitor.service;

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
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.ArrayList;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class PortfolioServiceTransactionTest {

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
        when(securityContext.getAuthentication()).thenReturn(authentication);
        when(authentication.getPrincipal()).thenReturn(mockUser);
    }

    @Test
    void addHoldingRecordsBuyTransaction() {
        // Given
        String ticker = "AAPL";
        double shares = 10.0;
        double currentPrice = 150.0;

        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockService.getLatestStockData(ticker)).thenReturn(Optional.of(createStock(ticker, currentPrice)));
        when(portfolioRepository.save(any(Portfolio.class))).thenReturn(mockPortfolio);
        when(transactionService.recordBuyTransaction(eq(ticker), eq(shares), eq(currentPrice)))
            .thenReturn(createTransaction(ticker, shares, currentPrice, TransactionType.BUY));

        // When
        portfolioService.addHolding(ticker, shares);

        // Then
        verify(transactionService).recordBuyTransaction(ticker, shares, currentPrice);
    }

    @Test
    void removeHoldingRecordsSellTransaction() {
        // Given
        String ticker = "GOOGL";
        double shares = 5.0;
        double currentPrice = 200.0;

        Holding holding = new Holding(ticker, shares);
        mockPortfolio.getHoldings().add(holding);

        when(portfolioRepository.findByUserId(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockService.getLatestStockData(ticker)).thenReturn(Optional.of(createStock(ticker, currentPrice)));
        when(transactionService.recordSellTransaction(eq(ticker), eq(shares), eq(currentPrice)))
            .thenReturn(createTransaction(ticker, shares, currentPrice, TransactionType.SELL));

        // When
        portfolioService.removeHolding(ticker);

        // Then
        verify(transactionService).recordSellTransaction(ticker, shares, currentPrice);
    }

    private Stock createStock(String ticker, double price) {
        Stock stock = new Stock();
        stock.setTicker(ticker);
        stock.setCurrentPrice(price);
        return stock;
    }

    private Transaction createTransaction(String ticker, double shares, double price, TransactionType type) {
        Transaction transaction = new Transaction(ticker, shares, price, type);
        transaction.setId(1);
        return transaction;
    }
}
