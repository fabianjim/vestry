package com.github.fabianjim.portfoliomonitor.repository;

import com.github.fabianjim.portfoliomonitor.model.JournalEntry;
import com.github.fabianjim.portfoliomonitor.model.JournalEntryType;
import com.github.fabianjim.portfoliomonitor.model.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
@ActiveProfiles("test")
class JournalEntryRepositoryTest {

    @Autowired
    private JournalEntryRepository journalEntryRepository;

    @Autowired
    private UserRepository userRepository;

    @Test
    void testSaveAndFindJournalEntry() {
        User user = new User();
        user.setUsername("journaluser");
        user.setPassword("password");
        user = userRepository.save(user);

        JournalEntry entry = new JournalEntry();
        entry.setUser(user);
        entry.setEntryType(JournalEntryType.BUY);
        entry.setBody("Bought AAPL on dip");
        entry.setTicker("AAPL");
        entry.setTimestamp(Instant.now());
        entry.setPriceSnapshot(150.0);

        JournalEntry saved = journalEntryRepository.save(entry);

        assertNotNull(saved.getId());
        assertEquals(JournalEntryType.BUY, saved.getEntryType());
        assertEquals("AAPL", saved.getTicker());
        assertEquals(150.0, saved.getPriceSnapshot(), 0.01);
    }

    @Test
    void testFindByUserIdOrderByTimestampDesc() {
        User user = new User();
        user.setUsername("journaluser2");
        user.setPassword("password");
        user = userRepository.save(user);

        JournalEntry entry1 = new JournalEntry();
        entry1.setUser(user);
        entry1.setEntryType(JournalEntryType.INSIGHT);
        entry1.setBody("Earlier insight");
        entry1.setTimestamp(Instant.now().minusSeconds(3600));
        journalEntryRepository.save(entry1);

        JournalEntry entry2 = new JournalEntry();
        entry2.setUser(user);
        entry2.setEntryType(JournalEntryType.MARKET_EVENT);
        entry2.setBody("Later event");
        entry2.setTimestamp(Instant.now());
        journalEntryRepository.save(entry2);

        List<JournalEntry> results = journalEntryRepository.findByUserIdOrderByTimestampDesc(user.getId());
        assertEquals(2, results.size());
        assertEquals(JournalEntryType.MARKET_EVENT, results.get(0).getEntryType());
        assertEquals(JournalEntryType.INSIGHT, results.get(1).getEntryType());
    }

    @Test
    void testFindByUserIdAndTicker() {
        User user = new User();
        user.setUsername("journaluser3");
        user.setPassword("password");
        user = userRepository.save(user);

        JournalEntry entry = new JournalEntry();
        entry.setUser(user);
        entry.setEntryType(JournalEntryType.SELL);
        entry.setBody("Sold AAPL");
        entry.setTicker("AAPL");
        entry.setTimestamp(Instant.now());
        journalEntryRepository.save(entry);

        List<JournalEntry> results = journalEntryRepository.findByUserIdAndTicker(user.getId(), "AAPL");
        assertEquals(1, results.size());
        assertEquals("AAPL", results.get(0).getTicker());
    }

    @Test
    void testFindByUserIdAndTimestampBetween() {
        User user = new User();
        user.setUsername("journaluser4");
        user.setPassword("password");
        user = userRepository.save(user);

        Instant now = Instant.now();
        Instant start = now.minusSeconds(7200);
        Instant end = now.plusSeconds(7200);

        JournalEntry entry = new JournalEntry();
        entry.setUser(user);
        entry.setEntryType(JournalEntryType.BUY);
        entry.setBody("In range");
        entry.setTimestamp(now);
        journalEntryRepository.save(entry);

        List<JournalEntry> results = journalEntryRepository.findByUserIdAndTimestampBetween(user.getId(), start, end);
        assertEquals(1, results.size());
        assertEquals("In range", results.get(0).getBody());
    }
}
