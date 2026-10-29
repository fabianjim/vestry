package me.vestry.repository;

import me.vestry.model.Transaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface TransactionRepository extends JpaRepository<Transaction, Integer> {
    
    List<Transaction> findTop12ByUserIdAndTimestampGreaterThanAndTimestampLessThanEqualOrderByTimestampDescIdDesc(
            int userId, Instant start, Instant end);

    List<Transaction> findByUserIdOrderByTimestampDesc(int userId);
    
    List<Transaction> findByUserIdAndTicker(int userId, String ticker);

    @Query("select t.user.id as userId, t.ticker as ticker, t.timestamp as timestamp from Transaction t"
            + " where t.type = me.vestry.model.Transaction.TransactionType.BUY")
    List<TickerMoment> findAllBuys();
}
