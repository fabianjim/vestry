package com.github.fabianjim.portfoliomonitor.controller;

import com.github.fabianjim.portfoliomonitor.model.DemoSession;
import com.github.fabianjim.portfoliomonitor.model.User;
import com.github.fabianjim.portfoliomonitor.model.WatchlistItem;
import com.github.fabianjim.portfoliomonitor.service.DemoSessionResolver;
import com.github.fabianjim.portfoliomonitor.service.DemoSessionService;
import com.github.fabianjim.portfoliomonitor.service.NasdaqMetadataService;
import com.github.fabianjim.portfoliomonitor.service.WatchlistService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/watchlist")
public class WatchlistController {

    private final WatchlistService watchlistService;
    private final NasdaqMetadataService nasdaqMetadataService;
    private final DemoSessionResolver demoSessionResolver;
    private final DemoSessionService demoSessionService;

    public WatchlistController(WatchlistService watchlistService, NasdaqMetadataService nasdaqMetadataService,
                               DemoSessionResolver demoSessionResolver,
                               DemoSessionService demoSessionService) {
        this.watchlistService = watchlistService;
        this.nasdaqMetadataService = nasdaqMetadataService;
        this.demoSessionResolver = demoSessionResolver;
        this.demoSessionService = demoSessionService;
    }

    @PostMapping
    public WatchlistItem addToWatchlist(@RequestBody Map<String, String> request, HttpServletRequest httpRequest) {
        String ticker = request.get("ticker");
        if (demoSessionResolver.isDemoUser()) {
            DemoSession session = demoSessionResolver.resolveSession(httpRequest);
            User user = demoSessionResolver.getCurrentUser();
            WatchlistItem item = demoSessionService.addToWatchlist(session, user, ticker);
            nasdaqMetadataService.lookupMetadata(item.getTicker()).ifPresent(item::setMetadata);
            return item;
        }
        WatchlistItem item = watchlistService.addToWatchlist(ticker);
        nasdaqMetadataService.lookupMetadata(item.getTicker()).ifPresent(item::setMetadata);
        return item;
    }

    @GetMapping
    public List<WatchlistItem> getWatchlist(HttpServletRequest request) {
        List<WatchlistItem> items;
        if (demoSessionResolver.isDemoUser()) {
            items = demoSessionService.getWatchlistItems(demoSessionResolver.resolveSession(request));
        } else {
            items = watchlistService.getWatchlistForUser();
        }
        for (WatchlistItem item : items) {
            nasdaqMetadataService.lookupMetadata(item.getTicker()).ifPresent(item::setMetadata);
        }
        return items;
    }

    @DeleteMapping("/{ticker}")
    public void removeFromWatchlist(@PathVariable String ticker, HttpServletRequest request) {
        if (demoSessionResolver.isDemoUser()) {
            demoSessionService.removeFromWatchlist(demoSessionResolver.resolveSession(request), ticker);
        } else {
            watchlistService.removeFromWatchlist(ticker);
        }
    }
}
