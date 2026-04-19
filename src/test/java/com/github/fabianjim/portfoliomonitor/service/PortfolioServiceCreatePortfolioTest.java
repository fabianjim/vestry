package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.model.Holding;
import com.github.fabianjim.portfoliomonitor.model.Portfolio;
import com.github.fabianjim.portfoliomonitor.model.Stock;
import com.github.fabianjim.portfoliomonitor.model.Transaction;
import com.github.fabianjim.portfoliomonitor.model.User;
import com.github.fabianjim.portfoliomonitor.repository.PortfolioRepository;
import com.github.fabianjim.portfoliomonitor.repository.StockMetadataRepository;
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
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class PortfolioServiceCreatePortfolioTest {

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
    private StockMetadataRepository stockMetadataRepository;

    @Mock
    private NasdaqMetadataService nasdaqMetadataService;

    @Mock
    private SecurityContext securityContext;

    @Mock
    private Authentication authentication;

    @InjectMocks
    private PortfolioService portfolioService;

    private User mockUser;

    @BeforeEach
    void setUp() {
        mockUser = new User();
        mockUser.setId(1);
        mockUser.setUsername("testuser");

        SecurityContextHolder.setContext(securityContext);
        when(securityContext.getAuthentication()).thenReturn(authentication);
        when(authentication.getPrincipal()).thenReturn(mockUser);
    }

    @Test
    void createPortfolioRecordsBuyTransactionsForInitialHoldings() {
        // Given
        String ticker1 = "AAPL";
        String ticker2 = "GOOGL";
        double shares1 = 10.0;
        double shares2 = 5.0;
        double price1 = 150.0;
        double price2 = 200.0;

        Portfolio portfolio = new Portfolio();
        portfolio.setHoldings(new ArrayList<>());
        portfolio.getHoldings().add(new Holding(ticker1, shares1));
        portfolio.getHoldings().add(new Holding(ticker2, shares2));

        when(userRepository.findById(1)).thenReturn(Optional.of(mockUser));
        when(portfolioRepository.save(any(Portfolio.class))).thenReturn(portfolio);
        when(trackedStockRepository.findByTicker(anyString())).thenReturn(Optional.empty());
        
        // Mock stock data fetch
        Stock stock1 = createStock(ticker1, price1);
        Stock stock2 = createStock(ticker2, price2);
        when(stockService.updateStockData(ticker1, Stock.StockType.INITIAL)).thenReturn(stock1);
        when(stockService.updateStockData(ticker2, Stock.StockType.INITIAL)).thenReturn(stock2);
        
        // Mock transaction recording
        when(transactionService.recordBuyTransaction(eq(ticker1), eq(shares1), eq(price1)))
            .thenReturn(createTransaction(ticker1, shares1, price1));
        when(transactionService.recordBuyTransaction(eq(ticker2), eq(shares2), eq(price2)))
            .thenReturn(createTransaction(ticker2, shares2, price2));

        // When
        portfolioService.createPortfolio(portfolio);

        // Then
        verify(transactionService).recordBuyTransaction(ticker1, shares1, price1);
        verify(transactionService).recordBuyTransaction(ticker2, shares2, price2);
        
        // Verify the transactions were recorded with correct values
        ArgumentCaptor<String> tickerCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Double> sharesCaptor = ArgumentCaptor.forClass(Double.class);
        ArgumentCaptor<Double> priceCaptor = ArgumentCaptor.forClass(Double.class);
        
        verify(transactionService, times(2)).recordBuyTransaction(tickerCaptor.capture(), sharesCaptor.capture(), priceCaptor.capture());
        
        List<String> capturedTickers = tickerCaptor.getAllValues();
        List<Double> capturedShares = sharesCaptor.getAllValues();
        List<Double> capturedPrices = priceCaptor.getAllValues();
        
        assertTrue(capturedTickers.contains(ticker1));
        assertTrue(capturedTickers.contains(ticker2));
        assertTrue(capturedPrices.contains(price1));
        assertTrue(capturedPrices.contains(price2));
        assertTrue(capturedShares.contains(shares1));
        assertTrue(capturedShares.contains(shares2));
    }

    @Test
    void createPortfolioWithEmptyHoldingsDoesNotRecordTransactions() {
        // Given
        Portfolio portfolio = new Portfolio();
        portfolio.setHoldings(new ArrayList<>());

        when(userRepository.findById(1)).thenReturn(Optional.of(mockUser));
        when(portfolioRepository.save(any(Portfolio.class))).thenReturn(portfolio);

        // When
        portfolioService.createPortfolio(portfolio);

        // Then
        verify(transactionService, never()).recordBuyTransaction(anyString(), anyDouble(), anyDouble());
    }

    @Test
    void createPortfolioWithNullHoldingsDoesNotRecordTransactions() {
        // Given
        Portfolio portfolio = new Portfolio();
        portfolio.setHoldings(null);

        when(userRepository.findById(1)).thenReturn(Optional.of(mockUser));

        // When
        portfolioService.createPortfolio(portfolio);

        // Then
        verify(transactionService, never()).recordBuyTransaction(anyString(), anyDouble(), anyDouble());
    }

    private Stock createStock(String ticker, double price) {
        Stock stock = new Stock();
        stock.setTicker(ticker);
        stock.setCurrentPrice(price);
        return stock;
    }

    private Transaction createTransaction(String ticker, double shares, double price) {
        Transaction transaction = new Transaction(ticker, shares, price, Transaction.TransactionType.BUY);
        transaction.setId(1);
        return transaction;
    }
}
