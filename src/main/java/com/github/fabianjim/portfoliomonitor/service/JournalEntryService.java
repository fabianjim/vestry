package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.model.JournalEntry;
import com.github.fabianjim.portfoliomonitor.model.JournalEntryType;
import com.github.fabianjim.portfoliomonitor.model.Stock;
import com.github.fabianjim.portfoliomonitor.model.Tag;
import com.github.fabianjim.portfoliomonitor.model.Transaction;
import com.github.fabianjim.portfoliomonitor.model.User;
import com.github.fabianjim.portfoliomonitor.repository.JournalEntryRepository;
import com.github.fabianjim.portfoliomonitor.repository.TransactionRepository;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import com.github.fabianjim.portfoliomonitor.dto.CalendarDayDTO;

@Service
@Transactional
public class JournalEntryService {

    private final JournalEntryRepository journalEntryRepository;
    private final StockService stockService;
    private final TagService tagService;
    private final TransactionRepository transactionRepository;

    public JournalEntryService(JournalEntryRepository journalEntryRepository, StockService stockService, TagService tagService, TransactionRepository transactionRepository) {
        this.journalEntryRepository = journalEntryRepository;
        this.stockService = stockService;
        this.tagService = tagService;
        this.transactionRepository = transactionRepository;
    }

    private User getCurrentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            throw new RuntimeException("No authenticated user found");
        }
        return (User) auth.getPrincipal();
    }

    private Integer getCurrentUserId() {
        return getCurrentUser().getId();
    }

    private void applyPriceSnapshot(JournalEntry entry) {
        if (entry.getPriceSnapshot() == null) {
            if (entry.getTicker() != null && !entry.getTicker().isBlank()) {
                Optional<Stock> stockOpt = stockService.getLatestStockData(entry.getTicker());
                entry.setPriceSnapshot(stockOpt.map(Stock::getCurrentPrice).orElse(0.0));
            } else {
                entry.setPriceSnapshot(null);
            }
        }
    }

    public JournalEntry createEntry(JournalEntry entry, List<String> tagNames) {
        User user = getCurrentUser();
        entry.setUser(user);
        if (entry.getTimestamp() == null) {
            entry.setTimestamp(Instant.now());
        }

        applyPriceSnapshot(entry);

        List<String> combinedTags = new ArrayList<>();
        if (tagNames != null) {
            combinedTags.addAll(tagNames);
        }
        String autoTag = computeAutoTagForSellEntry(user, entry);
        if (autoTag != null && !combinedTags.contains(autoTag)) {
            combinedTags.add(autoTag);
        }

        entry.setTags(tagService.resolveTags(user, combinedTags));
        return journalEntryRepository.save(entry);
    }

    public JournalEntry createEntry(JournalEntry entry) {
        return createEntry(entry, List.of());
    }

    public List<JournalEntry> getEntriesForUser() {
        return journalEntryRepository.findByUserIdOrderByTimestampDesc(getCurrentUserId());
    }

    public List<JournalEntry> getEntriesForUserAndTicker(String ticker) {
        return journalEntryRepository.findByUserIdAndTicker(getCurrentUserId(), ticker);
    }

    public List<JournalEntry> getEntriesInRange(Instant from, Instant to) {
        return journalEntryRepository.findByUserIdAndTimestampBetween(getCurrentUserId(), from, to);
    }

    public List<JournalEntry> getFilteredEntries(Instant from, Instant to, List<String> types, String ticker, List<Integer> tagIds, String query) {
        List<JournalEntry> entries = journalEntryRepository.findByUserIdOrderByTimestampDesc(getCurrentUserId());
        return entries.stream()
            .filter(e -> from == null || !e.getTimestamp().isBefore(from))
            .filter(e -> to == null || !e.getTimestamp().isAfter(to))
            .filter(e -> types == null || types.isEmpty() || types.contains(e.getEntryType().name()))
            .filter(e -> ticker == null || ticker.isBlank() || (e.getTicker() != null && e.getTicker().equalsIgnoreCase(ticker)))
            .filter(e -> tagIds == null || tagIds.isEmpty() || e.getTags().stream().anyMatch(t -> tagIds.contains(t.getId())))
            .filter(e -> query == null || query.isBlank() || e.getBody().toLowerCase().contains(query.toLowerCase()))
            .collect(Collectors.toList());
    }

    public List<CalendarDayDTO> getCalendarEntries(int year, int month, Instant from, Instant to, List<String> types, String ticker, List<Integer> tagIds, String query) {
        YearMonth yearMonth = YearMonth.of(year, month);
        Instant start = yearMonth.atDay(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
        Instant end = yearMonth.atEndOfMonth().atTime(23, 59, 59).atZone(ZoneId.systemDefault()).toInstant();
        List<JournalEntry> entries = journalEntryRepository.findByUserIdAndTimestampBetween(getCurrentUserId(), start, end);

        Map<LocalDate, Integer> counts = new HashMap<>();
        for (JournalEntry entry : entries) {
            if (from != null && entry.getTimestamp().isBefore(from)) continue;
            if (to != null && entry.getTimestamp().isAfter(to)) continue;
            if (types != null && !types.isEmpty() && !types.contains(entry.getEntryType().name())) continue;
            if (ticker != null && !ticker.isBlank() && (entry.getTicker() == null || !entry.getTicker().equalsIgnoreCase(ticker))) continue;
            if (tagIds != null && !tagIds.isEmpty() && entry.getTags().stream().noneMatch(t -> tagIds.contains(t.getId()))) continue;
            if (query != null && !query.isBlank() && !entry.getBody().toLowerCase().contains(query.toLowerCase())) continue;

            LocalDate date = entry.getTimestamp().atZone(ZoneId.systemDefault()).toLocalDate();
            counts.merge(date, 1, Integer::sum);
        }

        return counts.entrySet().stream()
            .map(e -> new CalendarDayDTO(e.getKey().toString(), e.getValue()))
            .collect(Collectors.toList());
    }

    public List<CalendarDayDTO> getCalendarEntries(int year, int month) {
        return getCalendarEntries(year, month, null, null, null, null, null, null);
    }

    public void deleteEntry(int id) {
        int userId = getCurrentUserId();
        JournalEntry entry = journalEntryRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("Journal entry not found"));
        if (entry.getUser().getId() != userId) {
            throw new RuntimeException("Journal entry not found");
        }
        journalEntryRepository.deleteById(id);
    }

    public JournalEntry updateEntry(int id, String body, List<String> tagNames) {
        int userId = getCurrentUserId();
        JournalEntry entry = journalEntryRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("Journal entry not found"));
        if (entry.getUser().getId() != userId) {
            throw new RuntimeException("Journal entry not found");
        }
        entry.setBody(body);
        entry.setTags(tagService.resolveTags(getCurrentUser(), tagNames));
        return journalEntryRepository.save(entry);
    }

    public JournalEntry updateEntry(int id, String body) {
        return updateEntry(id, body, List.of());
    }

    private String computeAutoTagForSellEntry(User user, JournalEntry entry) {
        if (entry.getEntryType() != JournalEntryType.SELL || entry.getTicker() == null || entry.getTicker().isBlank()) {
            return null;
        }
        Double realizedPnl = computeRealizedPnlForTicker(user, entry.getTicker());
        if (realizedPnl == null) {
            return null;
        }
        if (realizedPnl > 0) {
            return "win";
        }
        if (realizedPnl < 0) {
            return "loss";
        }
        return null;
    }

    private Double computeRealizedPnlForTicker(User user, String ticker) {
        List<Transaction> transactions = transactionRepository.findByUserIdAndTicker(user.getId(), ticker);
        if (transactions.isEmpty()) {
            return null;
        }

        double buyShares = 0;
        double buyCost = 0;
        double sellShares = 0;
        double sellProceeds = 0;

        for (Transaction tx : transactions) {
            if (tx.getType() == Transaction.TransactionType.BUY) {
                buyShares += tx.getShares();
                buyCost += tx.getTotalValue();
            } else if (tx.getType() == Transaction.TransactionType.SELL) {
                sellShares += tx.getShares();
                sellProceeds += tx.getTotalValue();
            }
        }

        if (buyShares == 0) {
            return null;
        }

        double avgCost = buyCost / buyShares;
        return sellProceeds - (avgCost * sellShares);
    }
}
