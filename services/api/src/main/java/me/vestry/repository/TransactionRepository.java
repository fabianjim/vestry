package me.vestry.repository;

import me.vestry.model.Transaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TransactionRepository extends JpaRepository<Transaction, Integer> {
    
    List<Transaction> findByUserIdOrderByTimestampDesc(int userId);
    
    List<Transaction> findByUserIdAndTicker(int userId, String ticker);
}
