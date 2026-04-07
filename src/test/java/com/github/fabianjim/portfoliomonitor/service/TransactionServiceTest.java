package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.model.Transaction;
import com.github.fabianjim.portfoliomonitor.model.Transaction.TransactionType;
import com.github.fabianjim.portfoliomonitor.model.User;
import com.github.fabianjim.portfoliomonitor.repository.TransactionRepository;

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

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class TransactionServiceTest {

    @Mock
    private TransactionRepository transactionRepository;

    @Mock
    private SecurityContext securityContext;

    @Mock
    private Authentication authentication;

    @InjectMocks
    private TransactionService transactionService;

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
    void recordBuyTransaction() {
        // Given
        String ticker = "AAPL";
        double shares = 10.0;
        double price = 150.0;

        when(transactionRepository.save(any(Transaction.class))).thenAnswer(invocation -> {
            Transaction t = invocation.getArgument(0);
            t.setId(1);
            return t;
        });

        // When
        Transaction result = transactionService.recordBuyTransaction(ticker, shares, price);

        // Then
        assertNotNull(result);
        assertEquals(ticker, result.getTicker());
        assertEquals(shares, result.getShares(), 0.01);
        assertEquals(price, result.getPrice(), 0.01);
        assertEquals(shares * price, result.getTotalValue(), 0.01);
        assertEquals(TransactionType.BUY, result.getType());
        assertEquals(mockUser, result.getUser());
        assertNotNull(result.getTimestamp());

        // Verify save was called
        ArgumentCaptor<Transaction> captor = ArgumentCaptor.forClass(Transaction.class);
        verify(transactionRepository).save(captor.capture());
        Transaction savedTransaction = captor.getValue();
        assertEquals(TransactionType.BUY, savedTransaction.getType());
    }

    @Test
    void recordSellTransaction() {
        // Given
        String ticker = "GOOGL";
        double shares = 5.0;
        double price = 200.0;

        when(transactionRepository.save(any(Transaction.class))).thenAnswer(invocation -> {
            Transaction t = invocation.getArgument(0);
            t.setId(2);
            return t;
        });

        // When
        Transaction result = transactionService.recordSellTransaction(ticker, shares, price);

        // Then
        assertNotNull(result);
        assertEquals(ticker, result.getTicker());
        assertEquals(shares, result.getShares(), 0.01);
        assertEquals(price, result.getPrice(), 0.01);
        assertEquals(shares * price, result.getTotalValue(), 0.01);
        assertEquals(TransactionType.SELL, result.getType());
        assertEquals(mockUser, result.getUser());
        assertNotNull(result.getTimestamp());

        // Verify save was called
        ArgumentCaptor<Transaction> captor = ArgumentCaptor.forClass(Transaction.class);
        verify(transactionRepository).save(captor.capture());
        Transaction savedTransaction = captor.getValue();
        assertEquals(TransactionType.SELL, savedTransaction.getType());
    }

    @Test
    void getTransactionHistoryForCurrentUser() {
        // Given
        Transaction transaction1 = new Transaction("AAPL", 10.0, 150.0, TransactionType.BUY);
        Transaction transaction2 = new Transaction("GOOGL", 5.0, 200.0, TransactionType.BUY);
        List<Transaction> mockTransactions = List.of(transaction1, transaction2);

        when(transactionRepository.findByUserIdOrderByTimestampDesc(mockUser.getId()))
            .thenReturn(mockTransactions);

        // When
        List<Transaction> result = transactionService.getTransactionHistory();

        // Then
        assertNotNull(result);
        assertEquals(2, result.size());
        assertEquals("AAPL", result.get(0).getTicker());
        assertEquals("GOOGL", result.get(1).getTicker());
        verify(transactionRepository).findByUserIdOrderByTimestampDesc(mockUser.getId());
    }

    @Test
    void getTransactionHistoryForSpecificTicker() {
        // Given
        String ticker = "AAPL";
        Transaction transaction = new Transaction(ticker, 10.0, 150.0, TransactionType.BUY);
        List<Transaction> mockTransactions = List.of(transaction);

        when(transactionRepository.findByUserIdAndTicker(mockUser.getId(), ticker))
            .thenReturn(mockTransactions);

        // When
        List<Transaction> result = transactionService.getTransactionHistoryForTicker(ticker);

        // Then
        assertNotNull(result);
        assertEquals(1, result.size());
        assertEquals(ticker, result.get(0).getTicker());
        verify(transactionRepository).findByUserIdAndTicker(mockUser.getId(), ticker);
    }

    @Test
    void getTransactionHistoryEmptyList() {
        // Given
        when(transactionRepository.findByUserIdOrderByTimestampDesc(mockUser.getId()))
            .thenReturn(List.of());

        // When
        List<Transaction> result = transactionService.getTransactionHistory();

        // Then
        assertNotNull(result);
        assertTrue(result.isEmpty());
    }
}
