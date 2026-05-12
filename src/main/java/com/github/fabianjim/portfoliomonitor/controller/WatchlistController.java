package com.github.fabianjim.portfoliomonitor.controller;

import com.github.fabianjim.portfoliomonitor.model.WatchlistItem;
import com.github.fabianjim.portfoliomonitor.service.NasdaqMetadataService;
import com.github.fabianjim.portfoliomonitor.service.WatchlistService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/watchlist")
public class WatchlistController {

    private final WatchlistService watchlistService;
    private final NasdaqMetadataService nasdaqMetadataService;

    public WatchlistController(WatchlistService watchlistService, NasdaqMetadataService nasdaqMetadataService) {
        this.watchlistService = watchlistService;
        this.nasdaqMetadataService = nasdaqMetadataService;
    }

    @PostMapping
    public WatchlistItem addToWatchlist(@RequestBody Map<String, String> request) {
        String ticker = request.get("ticker");
        return watchlistService.addToWatchlist(ticker);
    }

    @GetMapping
    public List<WatchlistItem> getWatchlist() {
        List<WatchlistItem> items = watchlistService.getWatchlistForUser();
        for (WatchlistItem item : items) {
            nasdaqMetadataService.lookupMetadata(item.getTicker()).ifPresent(item::setMetadata);
        }
        return items;
    }

    @DeleteMapping("/{ticker}")
    public void removeFromWatchlist(@PathVariable String ticker) {
        watchlistService.removeFromWatchlist(ticker);
    }
}
