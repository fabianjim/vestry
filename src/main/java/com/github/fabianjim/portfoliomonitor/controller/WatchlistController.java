package com.github.fabianjim.portfoliomonitor.controller;

import com.github.fabianjim.portfoliomonitor.model.WatchlistItem;
import com.github.fabianjim.portfoliomonitor.service.WatchlistService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/watchlist")
public class WatchlistController {

    private final WatchlistService watchlistService;

    public WatchlistController(WatchlistService watchlistService) {
        this.watchlistService = watchlistService;
    }

    @PostMapping
    public WatchlistItem addToWatchlist(@RequestBody Map<String, String> request) {
        String ticker = request.get("ticker");
        return watchlistService.addToWatchlist(ticker);
    }

    @GetMapping
    public List<WatchlistItem> getWatchlist() {
        return watchlistService.getWatchlistForUser();
    }

    @DeleteMapping("/{ticker}")
    public void removeFromWatchlist(@PathVariable String ticker) {
        watchlistService.removeFromWatchlist(ticker);
    }
}
