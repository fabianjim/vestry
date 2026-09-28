package me.vestry.service;

import me.vestry.model.JournalEntry;
import me.vestry.model.JournalEntryType;
import me.vestry.model.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class JournalEntryFiltersTest {
    @Test
    void selectedDatesUseNewYorkDaysAndExcludeGapsAcrossDst() {
        var matches = JournalEntryFilters.onDates(List.of(LocalDate.parse("2026-03-08"), LocalDate.parse("2026-03-10")));
        JournalEntry entry = new JournalEntry();
        for (String timestamp : List.of("2026-03-08T05:00:00Z", "2026-03-09T03:59:59.999999Z", "2026-03-10T04:00:00Z")) {
            entry.setTimestamp(Instant.parse(timestamp));
            assertTrue(matches.test(entry), timestamp);
        }
        for (String timestamp : List.of("2026-03-08T04:59:59Z", "2026-03-09T04:00:00Z", "2026-03-11T04:00:00Z")) {
            entry.setTimestamp(Instant.parse(timestamp));
            assertFalse(matches.test(entry), timestamp);
        }
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\t"})
    void clearingSearchIncludesEntriesWithoutTickers(String query) {
        JournalEntry entry = new JournalEntry();
        entry.setBody("A note");
        assertTrue(JournalEntryFilters.matching(null, null, List.of(), null, List.of(), query).test(entry));
    }

    @Test
    void searchMatchesSubstringsInEitherFieldAndHandlesMissingValues() {
        var matches = JournalEntryFilters.matching(null, null, null, null, null, "AaP");
        JournalEntry entry = new JournalEntry();
        entry.setTicker("AAPL");
        assertTrue(matches.test(entry));
        entry.setTicker(null);
        entry.setBody("Watching AAPL earnings");
        assertTrue(matches.test(entry));
        entry.setBody("Other notes");
        assertFalse(matches.test(entry));
        entry.setBody(null);
        assertFalse(matches.test(entry));
    }

    @Test
    void otherFiltersStillRestrictSearchWithInclusiveDatesAndAnySelectedTagOrType() {
        Instant timestamp = Instant.parse("2026-09-10T12:00:00Z");
        Tag tag = new Tag();
        tag.setId(7);
        JournalEntry entry = new JournalEntry();
        entry.setTimestamp(timestamp);
        entry.setEntryType(JournalEntryType.BUY);
        entry.setTicker("AAPL");
        entry.setBody("Initial portfolio creation");
        entry.setTags(Set.of(tag));

        assertTrue(JournalEntryFilters.matching(timestamp, timestamp, List.of("BUY", "SELL"),
            "aapl", List.of(7, 8), "aapl").test(entry));
        assertFalse(JournalEntryFilters.matching(timestamp.plusSeconds(1), null, null,
            null, null, "aapl").test(entry));
        assertFalse(JournalEntryFilters.matching(null, timestamp.minusSeconds(1), null,
            null, null, "aapl").test(entry));
        assertFalse(JournalEntryFilters.matching(null, null, List.of("SELL"),
            null, null, "aapl").test(entry));
        assertFalse(JournalEntryFilters.matching(null, null, null,
            null, List.of(8), "aapl").test(entry));
        assertFalse(JournalEntryFilters.matching(null, null, null,
            "AAP", null, "aapl").test(entry));
    }
}
