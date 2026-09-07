package me.vestry.service;

import me.vestry.model.Transaction;
import me.vestry.model.Transaction.TransactionType;
import me.vestry.model.User;
import me.vestry.repository.TransactionRepository;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
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

    public Transaction recordBuyTransaction(String ticker, double shares, double price) {
        return recordBuyTransaction(ticker, shares, price, null);
    }

    public Transaction recordBuyTransaction(String ticker, double shares, double price, Instant timestamp) {
        Transaction transaction = new Transaction(ticker, shares, price, TransactionType.BUY);
        if (timestamp != null) {
            transaction.setTimestamp(timestamp);
        }
        transaction.setUser(getCurrentUser());
        return transactionRepository.save(transaction);
    }

    public Transaction recordSellTransaction(String ticker, double shares, double price) {
        return recordSellTransaction(ticker, shares, price, null);
    }

    public Transaction recordSellTransaction(String ticker, double shares, double price, Instant timestamp) {
        Transaction transaction = new Transaction(ticker, shares, price, TransactionType.SELL);
        if (timestamp != null) {
            transaction.setTimestamp(timestamp);
        }
        transaction.setUser(getCurrentUser());
        return transactionRepository.save(transaction);
    }

    public List<Transaction> getTransactionHistory() {
        return transactionRepository.findByUserIdOrderByTimestampDesc(getCurrentUserId());
    }

    public List<Transaction> getTransactionHistoryForTicker(String ticker) {
        return transactionRepository.findByUserIdAndTicker(getCurrentUserId(), ticker);
    }
}
