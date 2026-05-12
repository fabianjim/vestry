package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.model.User;
import com.github.fabianjim.portfoliomonitor.model.WatchlistItem;
import com.github.fabianjim.portfoliomonitor.repository.WatchlistItemRepository;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@Transactional
public class WatchlistService {

    private final WatchlistItemRepository watchlistItemRepository;

    public WatchlistService(WatchlistItemRepository watchlistItemRepository) {
        this.watchlistItemRepository = watchlistItemRepository;
    }

    private User getCurrentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            throw new RuntimeException("No authenticated user found");
        }
        return (User) auth.getPrincipal();
    }

    private Integer getCurrentUserId() {
        return getCurrentUser().getId();
    }

    public WatchlistItem addToWatchlist(String ticker) {
        String normalizedTicker = ticker.trim().toUpperCase();
        int userId = getCurrentUserId();

        Optional<WatchlistItem> existing = watchlistItemRepository.findByUserIdAndTicker(userId, normalizedTicker);
        if (existing.isPresent()) {
            throw new RuntimeException("Ticker already in watchlist");
        }

        WatchlistItem item = new WatchlistItem();
        item.setUser(getCurrentUser());
        item.setTicker(normalizedTicker);
        return watchlistItemRepository.save(item);
    }

    public List<WatchlistItem> getWatchlistForUser() {
        return watchlistItemRepository.findByUserId(getCurrentUserId());
    }

    public void removeFromWatchlist(String ticker) {
        watchlistItemRepository.deleteByUserIdAndTicker(getCurrentUserId(), ticker.trim().toUpperCase());
    }
}
