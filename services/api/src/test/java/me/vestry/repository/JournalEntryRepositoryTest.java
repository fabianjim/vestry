package me.vestry.repository;

import me.vestry.model.JournalEntry;
import me.vestry.model.JournalEntryType;
import me.vestry.model.User;
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

    @Autowired
    private jakarta.persistence.EntityManager entityManager;

    @Test
    void reflectionLinkPersistsAndSourceDeletionConvertsOnlyItsChildren() {
        User user = new User();
        user.setUsername("reflectionuser");
        user.setPassword("password");
        userRepository.save(user);
        JournalEntry source = savedEntry(user, JournalEntryType.BUY, null);
        JournalEntry reflection = savedEntry(user, JournalEntryType.REFLECTION, source.getId());
        JournalEntry secondReflection = savedEntry(user, JournalEntryType.REFLECTION, source.getId());
        JournalEntry otherSource = savedEntry(user, JournalEntryType.INSIGHT, null);
        JournalEntry unrelated = savedEntry(user, JournalEntryType.REFLECTION, otherSource.getId());
        entityManager.flush();
        entityManager.clear();

        assertEquals(source.getId(), journalEntryRepository.findById(reflection.getId()).orElseThrow().getSourceEntryId());
        assertTrue(journalEntryRepository.findOwnedEntryForUpdate(source.getId(), user.getId() + 1).isEmpty());
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
            new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(user, null, List.of()));
        try {
            new me.vestry.service.JournalEntryService(journalEntryRepository, null, null, null, null)
                .deleteEntry(source.getId());
            entityManager.flush();
            entityManager.clear();

            assertTrue(journalEntryRepository.findById(source.getId()).isEmpty());
            for (int id : List.of(reflection.getId(), secondReflection.getId())) {
                JournalEntry converted = journalEntryRepository.findById(id).orElseThrow();
                assertEquals(JournalEntryType.INSIGHT, converted.getEntryType());
                assertNull(converted.getSourceEntryId());
                assertEquals("Keep this text", converted.getBody());
                assertEquals(125.0, converted.getPriceSnapshot());
                assertEquals(Instant.EPOCH, converted.getTimestamp());
            }
            assertEquals(JournalEntryType.REFLECTION,
                journalEntryRepository.findById(unrelated.getId()).orElseThrow().getEntryType());
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    private JournalEntry savedEntry(User user, JournalEntryType type, Integer sourceId) {
        JournalEntry entry = new JournalEntry();
        entry.setUser(user);
        entry.setEntryType(type);
        entry.setSourceEntryId(sourceId);
        entry.setBody("Keep this text");
        entry.setTimestamp(Instant.EPOCH);
        entry.setPriceSnapshot(125.0);
        return journalEntryRepository.save(entry);
    }

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
