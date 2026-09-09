package me.vestry.repository;

import me.vestry.model.TrackedStock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface TrackedStockRepository extends JpaRepository<TrackedStock, Integer> {
    
    Optional<TrackedStock> findByTicker(String ticker);
    
    boolean existsByTicker(String ticker);
    
    @Query("SELECT ts.ticker FROM TrackedStock ts WHERE ts.holderCount > 0")
    List<String> findAllActiveTickers();

    // Update only timestamps: never overwrite concurrent holder-count changes or recreate a row.
    // Keep timestamps monotonic if an immediate trade fetch finished after this batch began.
    @Modifying
    @Query("UPDATE TrackedStock ts SET ts.lastFetchAttempt = :attemptedAt " +
           "WHERE ts.ticker = :ticker AND (ts.lastFetchAttempt IS NULL OR ts.lastFetchAttempt < :attemptedAt)")
    int markFetchAttempt(@Param("ticker") String ticker, @Param("attemptedAt") Instant attemptedAt);

    @Modifying
    @Query("UPDATE TrackedStock ts SET " +
           "ts.lastFetchAttempt = CASE WHEN ts.lastFetchAttempt IS NULL OR ts.lastFetchAttempt < :attemptedAt " +
           "THEN :attemptedAt ELSE ts.lastFetchAttempt END, " +
           "ts.lastSuccessfulFetch = CASE WHEN ts.lastSuccessfulFetch IS NULL OR ts.lastSuccessfulFetch < :attemptedAt " +
           "THEN :attemptedAt ELSE ts.lastSuccessfulFetch END WHERE ts.ticker = :ticker")
    int markFetchSuccessful(@Param("ticker") String ticker, @Param("attemptedAt") Instant attemptedAt);
}
