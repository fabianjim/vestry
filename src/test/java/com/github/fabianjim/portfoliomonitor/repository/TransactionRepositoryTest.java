package com.github.fabianjim.portfoliomonitor.repository;

import com.github.fabianjim.portfoliomonitor.model.Transaction;
import com.github.fabianjim.portfoliomonitor.model.Transaction.TransactionType;
import com.github.fabianjim.portfoliomonitor.model.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
@ActiveProfiles("test")
class TransactionRepositoryTest {

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private UserRepository userRepository;

    @Test
    void testSaveAndFindTransaction() {
        // Create a user first
        User user = new User();
        user.setUsername("testuser");
        user.setPassword("password");
        user = userRepository.save(user);

        // Create a transaction
        Transaction transaction = new Transaction("AAPL", 10.0, 150.0, TransactionType.BUY);
        transaction.setUser(user);
        
        // Save the transaction
        Transaction savedTransaction = transactionRepository.save(transaction);
        
        // Verify it was saved with an ID
        assertNotNull(savedTransaction.getId());
        assertEquals("AAPL", savedTransaction.getTicker());
        assertEquals(10.0, savedTransaction.getShares(), 0.01);
        assertEquals(150.0, savedTransaction.getPrice(), 0.01);
        assertEquals(1500.0, savedTransaction.getTotalValue(), 0.01);
        assertEquals(TransactionType.BUY, savedTransaction.getType());
        assertNotNull(savedTransaction.getTimestamp());
    }

    @Test
    void testFindByUserIdOrderByTimestampDesc() {
        // Create a user
        User user = new User();
        user.setUsername("testuser2");
        user.setPassword("password");
        user = userRepository.save(user);

        // Create transactions at different times
        Transaction transaction1 = new Transaction("AAPL", 10.0, 150.0, TransactionType.BUY);
        transaction1.setUser(user);
        transaction1.setTimestamp(Instant.now().minusSeconds(3600)); // 1 hour ago
        transactionRepository.save(transaction1);

        Transaction transaction2 = new Transaction("GOOGL", 5.0, 200.0, TransactionType.BUY);
        transaction2.setUser(user);
        transaction2.setTimestamp(Instant.now()); // Now
        transactionRepository.save(transaction2);

        // Find by user ID ordered by timestamp desc
        List<Transaction> transactions = transactionRepository.findByUserIdOrderByTimestampDesc(user.getId());
        
        // Verify results
        assertEquals(2, transactions.size());
        assertEquals("GOOGL", transactions.get(0).getTicker()); // Most recent first
        assertEquals("AAPL", transactions.get(1).getTicker()); // Oldest last
    }

    @Test
    void testFindByUserIdAndTicker() {
        // Create a user
        User user = new User();
        user.setUsername("testuser3");
        user.setPassword("password");
        user = userRepository.save(user);

        // Create transactions for different tickers
        Transaction aaplTransaction = new Transaction("AAPL", 10.0, 150.0, TransactionType.BUY);
        aaplTransaction.setUser(user);
        transactionRepository.save(aaplTransaction);

        Transaction googlTransaction = new Transaction("GOOGL", 5.0, 200.0, TransactionType.BUY);
        googlTransaction.setUser(user);
        transactionRepository.save(googlTransaction);

        // Find by user ID and ticker
        List<Transaction> aaplTransactions = transactionRepository.findByUserIdAndTicker(user.getId(), "AAPL");
        
        // Verify results
        assertEquals(1, aaplTransactions.size());
        assertEquals("AAPL", aaplTransactions.get(0).getTicker());
    }
}
