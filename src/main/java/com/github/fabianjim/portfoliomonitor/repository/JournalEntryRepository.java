package com.github.fabianjim.portfoliomonitor.repository;

import com.github.fabianjim.portfoliomonitor.model.JournalEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface JournalEntryRepository extends JpaRepository<JournalEntry, Integer> {

    List<JournalEntry> findByUserIdOrderByTimestampDesc(int userId);

    List<JournalEntry> findByUserIdAndTicker(int userId, String ticker);

    List<JournalEntry> findByUserIdAndTimestampBetween(int userId, Instant start, Instant end);
}
