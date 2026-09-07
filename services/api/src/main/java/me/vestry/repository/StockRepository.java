package me.vestry.repository;

import me.vestry.model.Stock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.time.Instant;

@Repository
public interface StockRepository extends JpaRepository<Stock, Integer> {
    
    Optional<Stock> findByTicker(String ticker);
    
    Optional<Stock> findByTickerAndTimestamp(String ticker, Instant timestamp);
    
    boolean existsByTicker(String ticker);
    
    // find most recent stock data for a ticker
    Optional<Stock> findFirstByTickerOrderByTimestampDesc(String ticker);
    
    // find all stock data for a ticker
    List<Stock> findByTickerOrderByTimestampDesc(String ticker);
}
