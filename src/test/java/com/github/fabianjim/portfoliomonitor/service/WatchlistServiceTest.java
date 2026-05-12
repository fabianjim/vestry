package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.model.User;
import com.github.fabianjim.portfoliomonitor.model.WatchlistItem;
import com.github.fabianjim.portfoliomonitor.repository.WatchlistItemRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class WatchlistServiceTest {

    @Mock
    private WatchlistItemRepository watchlistItemRepository;

    @Mock
    private SecurityContext securityContext;

    @Mock
    private Authentication authentication;

    @InjectMocks
    private WatchlistService watchlistService;

    private User mockUser;

    @BeforeEach
    void setUp() {
        mockUser = new User();
        mockUser.setId(1);
        mockUser.setUsername("testuser");

        SecurityContextHolder.setContext(securityContext);
        when(securityContext.getAuthentication()).thenReturn(authentication);
        when(authentication.getPrincipal()).thenReturn(mockUser);
    }

    @Test
    void addToWatchlistCreatesItem() {
        String ticker = "AAPL";

        when(watchlistItemRepository.findByUserIdAndTicker(mockUser.getId(), ticker)).thenReturn(Optional.empty());
        when(watchlistItemRepository.save(any(WatchlistItem.class))).thenAnswer(invocation -> {
            WatchlistItem item = invocation.getArgument(0);
            item.setId(1);
            return item;
        });

        WatchlistItem result = watchlistService.addToWatchlist(ticker);

        assertNotNull(result);
        assertEquals(ticker, result.getTicker());
    }

    @Test
    void addToWatchlistThrowsIfAlreadyInWatchlist() {
        String ticker = "TSLA";

        when(watchlistItemRepository.findByUserIdAndTicker(mockUser.getId(), ticker))
            .thenReturn(Optional.of(new WatchlistItem()));

        RuntimeException exception = assertThrows(RuntimeException.class, () -> {
            watchlistService.addToWatchlist(ticker);
        });

        assertEquals("Ticker already in watchlist", exception.getMessage());
    }

    @Test
    void getWatchlistForUser() {
        WatchlistItem item = new WatchlistItem();
        item.setTicker("AAPL");
        when(watchlistItemRepository.findByUserId(mockUser.getId())).thenReturn(List.of(item));

        List<WatchlistItem> result = watchlistService.getWatchlistForUser();
        assertEquals(1, result.size());
        assertEquals("AAPL", result.get(0).getTicker());
    }

    @Test
    void removeFromWatchlist() {
        String ticker = "META";

        watchlistService.removeFromWatchlist(ticker);

        verify(watchlistItemRepository).deleteByUserIdAndTicker(mockUser.getId(), ticker);
    }
}
