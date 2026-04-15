package com.github.fabianjim.portfoliomonitor.repository;

import com.github.fabianjim.portfoliomonitor.model.StockMetadata;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface StockMetadataRepository extends JpaRepository<StockMetadata, String> {

    Optional<StockMetadata> findByTicker(String ticker);

    boolean existsByTicker(String ticker);
}
