package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.model.Transaction;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;

@Component
public class RealizedPnlCalculator {

    private static final double EPSILON = 1e-9;

    public Double computeRealizedPnl(List<Transaction> transactions, String ticker, Instant sellTimestamp, double sellShares, double sellPrice) {
        if (transactions == null || transactions.isEmpty() || ticker == null || ticker.isBlank()) {
            return null;
        }

        double heldShares = 0;
        double costBasis = 0;
        Double lastAvgCost = null;

        List<Transaction> history = transactions.stream()
            .filter(tx -> ticker.equalsIgnoreCase(tx.getTicker()))
            .filter(tx -> sellTimestamp == null || tx.getTimestamp() == null || !tx.getTimestamp().isAfter(sellTimestamp))
            .sorted(Comparator.comparing(Transaction::getTimestamp, Comparator.nullsLast(Comparator.naturalOrder())).thenComparingInt(Transaction::getId))
            .toList();

        for (Transaction tx : history) {
            if (tx.getType() == Transaction.TransactionType.BUY) {
                heldShares += tx.getShares();
                costBasis += tx.getTotalValue();
                lastAvgCost = costBasis / heldShares;
            } else if (tx.getType() == Transaction.TransactionType.SELL && heldShares > EPSILON) {
                double avgCost = costBasis / heldShares;
                lastAvgCost = avgCost;
                heldShares -= tx.getShares();
                costBasis -= avgCost * tx.getShares();
            }
        }

        if (lastAvgCost == null) {
            return null;
        }

        return sellShares * (sellPrice - lastAvgCost);
    }

    public String resultTagFor(Double realizedPnl) {
        if (realizedPnl == null) {
            return null;
        }
        if (realizedPnl > EPSILON) {
            return "win";
        }
        if (realizedPnl < -EPSILON) {
            return "loss";
        }
        return null;
    }
}
