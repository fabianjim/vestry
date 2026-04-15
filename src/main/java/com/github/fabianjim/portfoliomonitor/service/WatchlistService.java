package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.model.StockMetadata;
import com.github.fabianjim.portfoliomonitor.model.User;
import com.github.fabianjim.portfoliomonitor.model.WatchlistItem;
import com.github.fabianjim.portfoliomonitor.repository.StockMetadataRepository;
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
    private final StockMetadataRepository stockMetadataRepository;
    private final NasdaqMetadataService nasdaqMetadataService;

    public WatchlistService(WatchlistItemRepository watchlistItemRepository,
                           StockMetadataRepository stockMetadataRepository,
                           NasdaqMetadataService nasdaqMetadataService) {
        this.watchlistItemRepository = watchlistItemRepository;
        this.stockMetadataRepository = stockMetadataRepository;
        this.nasdaqMetadataService = nasdaqMetadataService;
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

        if (!stockMetadataRepository.existsByTicker(normalizedTicker)) {
            Optional<StockMetadata> metadataOpt = nasdaqMetadataService.lookupMetadata(normalizedTicker);
            metadataOpt.ifPresent(stockMetadataRepository::save);
        }

        WatchlistItem item = new WatchlistItem();
        item.setUser(getCurrentUser());
        item.setTicker(normalizedTicker);
        return watchlistItemRepository.save(item);
    }

    public List<WatchlistItem> getWatchlistForUser() {
        List<WatchlistItem> items = watchlistItemRepository.findByUserId(getCurrentUserId());
        for (WatchlistItem item : items) {
            stockMetadataRepository.findByTicker(item.getTicker()).ifPresent(item::setMetadata);
        }
        return items;
    }

    public void removeFromWatchlist(String ticker) {
        watchlistItemRepository.deleteByUserIdAndTicker(getCurrentUserId(), ticker.trim().toUpperCase());
    }
}
