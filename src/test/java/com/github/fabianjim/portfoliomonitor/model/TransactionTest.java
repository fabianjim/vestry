package com.github.fabianjim.portfoliomonitor.model;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.*;

public class TransactionTest {

    @Test
    void createTransactionWithAllFields() {
        // Given
        Instant now = Instant.now();
        String ticker = "AAPL";
        double shares = 10.0;
        double price = 150.0;
        double totalValue = 1500.0;
        Transaction.TransactionType type = Transaction.TransactionType.BUY;
        
        // When
        Transaction transaction = new Transaction();
        transaction.setTicker(ticker);
        transaction.setShares(shares);
        transaction.setPrice(price);
        transaction.setTotalValue(totalValue);
        transaction.setType(type);
        transaction.setTimestamp(now);
        
        // Then
        assertEquals(ticker, transaction.getTicker());
        assertEquals(shares, transaction.getShares(), 0.01);
        assertEquals(price, transaction.getPrice(), 0.01);
        assertEquals(totalValue, transaction.getTotalValue(), 0.01);
        assertEquals(type, transaction.getType());
        assertEquals(now, transaction.getTimestamp());
    }

    @Test
    void transactionTypeEnumHasBuyAndSell() {
        // Given/When/Then
        assertNotNull(Transaction.TransactionType.BUY);
        assertNotNull(Transaction.TransactionType.SELL);
        assertEquals(2, Transaction.TransactionType.values().length);
    }

    @Test
    void transactionPrePersistSetsTimestamp() {
        // Given
        Transaction transaction = new Transaction();
        transaction.setTicker("GOOGL");
        transaction.setShares(5.0);
        transaction.setPrice(200.0);
        transaction.setTotalValue(1000.0);
        transaction.setType(Transaction.TransactionType.BUY);
        
        // When
        Instant beforePersist = Instant.now();
        transaction.prePersist();
        Instant afterPersist = Instant.now();
        
        // Then
        assertNotNull(transaction.getTimestamp());
        assertTrue(!transaction.getTimestamp().isBefore(beforePersist));
        assertTrue(!transaction.getTimestamp().isAfter(afterPersist));
    }

    @Test
    void createTransactionWithConvenienceConstructor() {
        // Given
        String ticker = "MSFT";
        double shares = 20.0;
        double price = 300.0;
        Transaction.TransactionType type = Transaction.TransactionType.SELL;
        
        // When
        Transaction transaction = new Transaction(ticker, shares, price, type);
        
        // Then
        assertEquals(ticker, transaction.getTicker());
        assertEquals(shares, transaction.getShares(), 0.01);
        assertEquals(price, transaction.getPrice(), 0.01);
        assertEquals(shares * price, transaction.getTotalValue(), 0.01);
        assertEquals(type, transaction.getType());
        assertNotNull(transaction.getTimestamp());
    }
}
