package me.vestry.repository;

import jakarta.persistence.EntityManager;
import me.vestry.model.JournalEntry;
import me.vestry.model.JournalEntryType;
import me.vestry.model.RunUp;
import me.vestry.model.Transaction;
import me.vestry.model.Transaction.TransactionType;
import me.vestry.model.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
@ActiveProfiles("test")
class RunUpRepositoryTest {
    @Autowired private RunUpRepository runUps;
    @Autowired private TransactionRepository transactions;
    @Autowired private JournalEntryRepository entries;
    @Autowired private UserRepository users;
    @Autowired private EntityManager entityManager;

    @Test
    void storesOneRunUpPerTickerAndNewYorkBuyDay() {
        // 01:00 UTC on Mar 4 is still Mar 3 in New York
        var key = RunUp.Key.of("nvda", Instant.parse("2026-03-04T01:00:00Z"));
        assertEquals(new RunUp.Key("NVDA", LocalDate.of(2026, 3, 3)), key);
        runUps.save(RunUp.known(key, 0.142, Instant.parse("2026-10-28T14:00:00Z")));
        runUps.save(RunUp.unavailable(new RunUp.Key("GONE", LocalDate.of(2026, 3, 3)), Instant.parse("2026-10-28T14:00:00Z")));
        entityManager.flush();
        entityManager.clear();

        var found = runUps.findAllById(List.of(key, new RunUp.Key("AAPL", LocalDate.of(2026, 3, 3))));
        assertEquals(1, found.size());
        assertEquals(RunUp.Status.KNOWN, found.get(0).getStatus());
        assertEquals(0.142, found.get(0).getValue());
        assertNull(runUps.findById(new RunUp.Key("GONE", LocalDate.of(2026, 3, 3))).orElseThrow().getValue());
    }

    @Test
    void readsBuysAndInitialEntriesAsTickerMoments() {
        User user = new User();
        user.setUsername("runupuser");
        user.setPassword("password");
        users.save(user);
        var created = Instant.parse("2026-01-05T15:00:00Z");
        save(user, "AAPL", TransactionType.BUY, created);
        save(user, "NVDA", TransactionType.BUY, Instant.parse("2026-03-03T15:00:00Z"));
        save(user, "AAPL", TransactionType.SELL, Instant.parse("2026-04-01T15:00:00Z"));
        entry(user, JournalEntryType.BUY, "Initial portfolio creation", "AAPL", created);
        entry(user, JournalEntryType.BUY, "Bought on the dip", "NVDA", Instant.parse("2026-03-03T15:00:00Z"));
        entry(user, JournalEntryType.INSIGHT, "Initial portfolio creation", "MSFT", created);
        entityManager.flush();

        var buys = transactions.findAllBuys();
        assertEquals(Set.of("AAPL@" + created, "NVDA@2026-03-03T15:00:00Z"),
                Set.copyOf(buys.stream().map(b -> b.getTicker() + "@" + b.getTimestamp()).toList()));
        assertTrue(buys.stream().allMatch(b -> b.getUserId() == user.getId()));
        var initial = entries.findBuyEntriesWithBody("Initial portfolio creation");
        assertEquals(1, initial.size());
        assertEquals("AAPL", initial.get(0).getTicker());
        assertEquals(created, initial.get(0).getTimestamp());
    }

    private void save(User user, String ticker, TransactionType type, Instant at) {
        var tx = new Transaction(ticker, 1, 100, type);
        tx.setTimestamp(at);
        tx.setUser(user);
        transactions.save(tx);
    }

    private void entry(User user, JournalEntryType type, String body, String ticker, Instant at) {
        var entry = new JournalEntry();
        entry.setUser(user);
        entry.setEntryType(type);
        entry.setBody(body);
        entry.setTicker(ticker);
        entry.setTimestamp(at);
        entries.save(entry);
    }
}
