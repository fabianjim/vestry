package com.github.fabianjim.portfoliomonitor.repository;

import com.github.fabianjim.portfoliomonitor.model.TrackedStock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TrackedStockRepository extends JpaRepository<TrackedStock, Integer> {
    
    Optional<TrackedStock> findByTicker(String ticker);
    
    boolean existsByTicker(String ticker);
    
    @Query("SELECT ts.ticker FROM TrackedStock ts WHERE ts.holderCount > 0")
    List<String> findAllActiveTickers();
}
