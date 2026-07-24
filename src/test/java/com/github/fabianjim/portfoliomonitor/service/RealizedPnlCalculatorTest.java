package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.model.Transaction;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

public class RealizedPnlCalculatorTest {

    private final RealizedPnlCalculator calculator = new RealizedPnlCalculator();

    private Transaction tx(String ticker, double shares, double price, Transaction.TransactionType type, Instant timestamp) {
        Transaction tx = new Transaction(ticker, shares, price, type);
        tx.setTotalValue(shares * price);
        tx.setTimestamp(timestamp);
        return tx;
    }

    @Test
    void profitAboveAverageCostIsWin() {
        List<Transaction> history = List.of(
            tx("AAPL", 10, 100.0, Transaction.TransactionType.BUY, Instant.parse("2026-01-01T00:00:00Z"))
        );
        Double pnl = calculator.computeRealizedPnl(history, "AAPL", Instant.parse("2026-02-01T00:00:00Z"), 5, 120.0);
        assertNotNull(pnl);
        assertTrue(pnl > 0);
        assertEquals("win", calculator.resultTagFor(pnl));
    }

    @Test
    void lossBelowAverageCostIsLoss() {
        List<Transaction> history = List.of(
            tx("AAPL", 10, 100.0, Transaction.TransactionType.BUY, Instant.parse("2026-01-01T00:00:00Z"))
        );
        Double pnl = calculator.computeRealizedPnl(history, "AAPL", Instant.parse("2026-02-01T00:00:00Z"), 5, 80.0);
        assertNotNull(pnl);
        assertTrue(pnl < 0);
        assertEquals("loss", calculator.resultTagFor(pnl));
    }

    @Test
    void priorSellDoesNotChangeAverageCost() {
        List<Transaction> history = List.of(
            tx("AAPL", 10, 100.0, Transaction.TransactionType.BUY, Instant.parse("2026-01-01T00:00:00Z")),
            tx("AAPL", 5, 150.0, Transaction.TransactionType.SELL, Instant.parse("2026-01-15T00:00:00Z"))
        );
        Double pnl = calculator.computeRealizedPnl(history, "AAPL", Instant.parse("2026-02-01T00:00:00Z"), 5, 90.0);
        assertNotNull(pnl);
        assertEquals(-50.0, pnl, 0.001);
        assertEquals("loss", calculator.resultTagFor(pnl));
    }

    @Test
    void rebuyAfterSellBlendsWithRemainingBasis() {
        List<Transaction> history = List.of(
            tx("AAPL", 10, 100.0, Transaction.TransactionType.BUY, Instant.parse("2026-01-01T00:00:00Z")),
            tx("AAPL", 5, 150.0, Transaction.TransactionType.SELL, Instant.parse("2026-01-15T00:00:00Z")),
            tx("AAPL", 5, 200.0, Transaction.TransactionType.BUY, Instant.parse("2026-01-20T00:00:00Z"))
        );
        // remaining basis 500 + new buy 1000 = 1500 over 10 shares -> avg 150
        Double pnl = calculator.computeRealizedPnl(history, "AAPL", Instant.parse("2026-02-01T00:00:00Z"), 10, 160.0);
        assertNotNull(pnl);
        assertEquals(100.0, pnl, 0.001);
    }

    @Test
    void transactionsAfterSellTimestampAreExcluded() {
        List<Transaction> history = List.of(
            tx("AAPL", 10, 100.0, Transaction.TransactionType.BUY, Instant.parse("2026-01-01T00:00:00Z")),
            tx("AAPL", 10, 1000.0, Transaction.TransactionType.BUY, Instant.parse("2026-03-01T00:00:00Z"))
        );
        Double pnl = calculator.computeRealizedPnl(history, "AAPL", Instant.parse("2026-02-01T00:00:00Z"), 5, 110.0);
        assertNotNull(pnl);
        assertEquals(50.0, pnl, 0.001);
    }

    @Test
    void fullExitStillUsesPreSellAverageCost() {
        List<Transaction> history = List.of(
            tx("AAPL", 10, 100.0, Transaction.TransactionType.BUY, Instant.parse("2026-01-01T00:00:00Z")),
            tx("AAPL", 10, 120.0, Transaction.TransactionType.SELL, Instant.parse("2026-01-15T00:00:00Z"))
        );
        Double pnl = calculator.computeRealizedPnl(history, "AAPL", Instant.parse("2026-01-15T00:00:00Z"), 1, 120.0);
        assertNotNull(pnl);
        assertEquals(20.0, pnl, 0.001);
    }

    @Test
    void noCostBasisReturnsNullAndNoTag() {
        Double pnl = calculator.computeRealizedPnl(List.of(), "AAPL", Instant.now(), 5, 100.0);
        assertNull(pnl);
        assertNull(calculator.resultTagFor(null));
    }

    @Test
    void breakevenReturnsNoTag() {
        List<Transaction> history = List.of(
            tx("AAPL", 10, 100.0, Transaction.TransactionType.BUY, Instant.parse("2026-01-01T00:00:00Z"))
        );
        Double pnl = calculator.computeRealizedPnl(history, "AAPL", Instant.parse("2026-02-01T00:00:00Z"), 5, 100.0);
        assertNotNull(pnl);
        assertNull(calculator.resultTagFor(pnl));
    }

    @Test
    void tickerMatchingIsCaseInsensitive() {
        List<Transaction> history = List.of(
            tx("aapl", 10, 100.0, Transaction.TransactionType.BUY, Instant.parse("2026-01-01T00:00:00Z"))
        );
        Double pnl = calculator.computeRealizedPnl(history, "AAPL", Instant.parse("2026-02-01T00:00:00Z"), 5, 110.0);
        assertNotNull(pnl);
        assertEquals(50.0, pnl, 0.001);
    }
}
