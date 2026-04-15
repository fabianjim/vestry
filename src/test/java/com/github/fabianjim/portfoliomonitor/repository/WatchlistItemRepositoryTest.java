package com.github.fabianjim.portfoliomonitor.repository;

import com.github.fabianjim.portfoliomonitor.model.User;
import com.github.fabianjim.portfoliomonitor.model.WatchlistItem;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
@ActiveProfiles("test")
class WatchlistItemRepositoryTest {

    @Autowired
    private WatchlistItemRepository watchlistItemRepository;

    @Autowired
    private UserRepository userRepository;

    @Test
    void testSaveAndFindByUserId() {
        User user = new User();
        user.setUsername("watchuser");
        user.setPassword("password");
        user = userRepository.save(user);

        WatchlistItem item = new WatchlistItem();
        item.setUser(user);
        item.setTicker("AAPL");
        watchlistItemRepository.save(item);

        List<WatchlistItem> results = watchlistItemRepository.findByUserId(user.getId());
        assertEquals(1, results.size());
        assertEquals("AAPL", results.get(0).getTicker());
    }

    @Test
    void testFindByUserIdAndTicker() {
        User user = new User();
        user.setUsername("watchuser2");
        user.setPassword("password");
        user = userRepository.save(user);

        WatchlistItem item = new WatchlistItem();
        item.setUser(user);
        item.setTicker("TSLA");
        watchlistItemRepository.save(item);

        Optional<WatchlistItem> found = watchlistItemRepository.findByUserIdAndTicker(user.getId(), "TSLA");
        assertTrue(found.isPresent());
        assertEquals("TSLA", found.get().getTicker());

        Optional<WatchlistItem> notFound = watchlistItemRepository.findByUserIdAndTicker(user.getId(), "UNKNOWN");
        assertFalse(notFound.isPresent());
    }

    @Test
    void testDeleteByUserIdAndTicker() {
        User user = new User();
        user.setUsername("watchuser3");
        user.setPassword("password");
        user = userRepository.save(user);

        WatchlistItem item = new WatchlistItem();
        item.setUser(user);
        item.setTicker("META");
        watchlistItemRepository.save(item);

        assertEquals(1, watchlistItemRepository.findByUserId(user.getId()).size());

        watchlistItemRepository.deleteByUserIdAndTicker(user.getId(), "META");

        assertEquals(0, watchlistItemRepository.findByUserId(user.getId()).size());
    }
}
