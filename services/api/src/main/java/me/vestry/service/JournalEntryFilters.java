package me.vestry.service;

import me.vestry.model.JournalEntry;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.function.Predicate;

/** Shared matching rules for journal lists and calendars, including demo sessions. */
final class JournalEntryFilters {
    private JournalEntryFilters() {}

    static Predicate<JournalEntry> matching(Instant from, Instant to, List<String> types,
            String ticker, List<Integer> tagIds, String query) {
        String search = query == null || query.isBlank() ? null : query.toLowerCase(Locale.ROOT);
        return entry ->
            (from == null || !entry.getTimestamp().isBefore(from))
            && (to == null || !entry.getTimestamp().isAfter(to))
            && (types == null || types.isEmpty() || types.contains(entry.getEntryType().name()))
            && (ticker == null || ticker.isBlank()
                || (entry.getTicker() != null && entry.getTicker().equalsIgnoreCase(ticker)))
            && (tagIds == null || tagIds.isEmpty()
                || entry.getTags().stream().anyMatch(tag -> tagIds.contains(tag.getId())))
            && (search == null || contains(entry.getBody(), search) || contains(entry.getTicker(), search));
    }

    private static boolean contains(String value, String search) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(search);
    }
}
