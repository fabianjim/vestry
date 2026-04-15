package com.github.fabianjim.portfoliomonitor.repository;

import com.github.fabianjim.portfoliomonitor.model.WatchlistItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface WatchlistItemRepository extends JpaRepository<WatchlistItem, Integer> {

    List<WatchlistItem> findByUserId(int userId);

    Optional<WatchlistItem> findByUserIdAndTicker(int userId, String ticker);

    void deleteByUserIdAndTicker(int userId, String ticker);
}
