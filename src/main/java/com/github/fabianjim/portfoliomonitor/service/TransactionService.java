package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.model.Transaction;
import com.github.fabianjim.portfoliomonitor.model.Transaction.TransactionType;
import com.github.fabianjim.portfoliomonitor.model.User;
import com.github.fabianjim.portfoliomonitor.repository.TransactionRepository;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional
public class TransactionService {

    private final TransactionRepository transactionRepository;

    public TransactionService(TransactionRepository transactionRepository) {
        this.transactionRepository = transactionRepository;
    }

    private Integer getCurrentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            throw new RuntimeException("No authenticated user found");
        }
        User user = (User) auth.getPrincipal();
        return user.getId();
    }

    private User getCurrentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            throw new RuntimeException("No authenticated user found");
        }
        return (User) auth.getPrincipal();
    }

    /**
     * Record a buy transaction
     */
    public Transaction recordBuyTransaction(String ticker, double shares, double price) {
        Transaction transaction = new Transaction(ticker, shares, price, TransactionType.BUY);
        transaction.setUser(getCurrentUser());
        return transactionRepository.save(transaction);
    }

    /**
     * Record a sell transaction
     */
    public Transaction recordSellTransaction(String ticker, double shares, double price) {
        Transaction transaction = new Transaction(ticker, shares, price, TransactionType.SELL);
        transaction.setUser(getCurrentUser());
        return transactionRepository.save(transaction);
    }

    /**
     * Get transaction history for current user
     */
    public List<Transaction> getTransactionHistory() {
        return transactionRepository.findByUserIdOrderByTimestampDesc(getCurrentUserId());
    }

    /**
     * Get transaction history for current user and specific ticker
     */
    public List<Transaction> getTransactionHistoryForTicker(String ticker) {
        return transactionRepository.findByUserIdAndTicker(getCurrentUserId(), ticker);
    }
}
