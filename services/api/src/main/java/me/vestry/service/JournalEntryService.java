package me.vestry.service;

import me.vestry.model.JournalEntry;
import me.vestry.model.JournalEntryType;
import me.vestry.model.Stock;
import me.vestry.model.Tag;
import me.vestry.model.Transaction;
import me.vestry.model.User;
import me.vestry.repository.JournalEntryRepository;
import me.vestry.repository.TransactionRepository;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import me.vestry.dto.CalendarDayDTO;

@Service
@Transactional
public class JournalEntryService {

    private final JournalEntryRepository journalEntryRepository;
    private final StockService stockService;
    private final TagService tagService;
    private final TransactionRepository transactionRepository;
    private final RealizedPnlCalculator realizedPnlCalculator;
    private final EntryEvents entryEvents;

    public JournalEntryService(JournalEntryRepository journalEntryRepository, StockService stockService, TagService tagService, TransactionRepository transactionRepository, RealizedPnlCalculator realizedPnlCalculator, EntryEvents entryEvents) {
        this.journalEntryRepository = journalEntryRepository;
        this.stockService = stockService;
        this.tagService = tagService;
        this.transactionRepository = transactionRepository;
        this.realizedPnlCalculator = realizedPnlCalculator;
        this.entryEvents = entryEvents;
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
        if (entry.getEntryType() == JournalEntryType.REFLECTION) {
            if (entry.getSourceEntryId() == null) {
                throw new IllegalArgumentException("A reflection requires a source entry");
            }
            JournalEntry source = journalEntryRepository.findOwnedEntryForUpdate(entry.getSourceEntryId(), user.getId())
                .orElseThrow(() -> new IllegalArgumentException("Journal entry not found"));
            if (entry.getBody() == null || entry.getBody().isBlank() || entry.getBody().length() > 2000) {
                throw new IllegalArgumentException("A reflection must contain between 1 and 2000 characters");
            }
            entry.setTicker(source.getTicker());
            entry.setTimestamp(Instant.now());
            entry.setPriceSnapshot(null);
        } else if (entry.getSourceEntryId() != null) {
            throw new IllegalArgumentException("Only reflections can link to a source entry");
        }
        if (entry.getTimestamp() == null) {
            entry.setTimestamp(Instant.now());
        }

        applyPriceSnapshot(entry);
        if (entry.getEntryType() == JournalEntryType.REFLECTION && entry.getPriceSnapshot() != null
                && (!Double.isFinite(entry.getPriceSnapshot()) || entry.getPriceSnapshot() <= 0)) {
            entry.setPriceSnapshot(null);
        }

        List<String> combinedTags = new ArrayList<>();
        if (tagNames != null) {
            combinedTags.addAll(tagNames);
        }
        String autoTag = computeAutoTagForSellEntry(user, entry);
        if (autoTag != null && !combinedTags.contains(autoTag)) {
            combinedTags.add(autoTag);
        }

        entry.setTags(tagService.resolveTags(user, combinedTags));
        return saveAndNotify(entry);
    }

    static final String INITIAL_ENTRY_BODY = "Initial portfolio creation";

    static String autoSellBody(double shares, String ticker) {
        return "Sold " + shares + " " + ticker;
    }

    /** True while the body is still the one vestry generated, i.e. the user never wrote anything. */
    static boolean isAutoWritten(JournalEntry entry) {
        String body = entry.getBody();
        if (body == null || entry.getTicker() == null) {
            return false;
        }
        if (entry.getEntryType() == JournalEntryType.BUY) {
            return body.equals(INITIAL_ENTRY_BODY);
        }
        String prefix = "Sold ";
        String suffix = " " + entry.getTicker();
        if (entry.getEntryType() != JournalEntryType.SELL || !body.startsWith(prefix) || !body.endsWith(suffix)
                || body.length() <= prefix.length() + suffix.length()) {
            return false;
        }
        try {
            double shares = Double.parseDouble(body.substring(prefix.length(), body.length() - suffix.length()));
            return body.equals(autoSellBody(shares, entry.getTicker()));
        } catch (NumberFormatException e) {
            return false;
        }
    }

    public JournalEntry createInitialEntry(User user, String ticker, double price, Instant timestamp) {
        JournalEntry entry = new JournalEntry();
        entry.setEntryType(JournalEntryType.BUY);
        entry.setBody(INITIAL_ENTRY_BODY);
        entry.setTicker(ticker);
        entry.setTimestamp(timestamp != null ? timestamp : Instant.now());
        entry.setPriceSnapshot(price);
        entry.setUser(user);
        entry.setTags(Set.of());
        return saveAndNotify(entry);
    }

    public JournalEntry createAutoSellEntry(User user, String ticker, double shares, double price, Instant timestamp) {
        JournalEntry entry = new JournalEntry();
        entry.setEntryType(JournalEntryType.SELL);
        entry.setBody(autoSellBody(shares, ticker));
        entry.setTicker(ticker);
        entry.setTimestamp(timestamp != null ? timestamp : Instant.now());
        entry.setPriceSnapshot(price);
        entry.setUser(user);

        List<Transaction> transactions = transactionRepository.findByUserIdAndTicker(user.getId(), ticker);
        Double realizedPnl = realizedPnlCalculator.computeRealizedPnl(transactions, ticker, entry.getTimestamp(), shares, price);
        String resultTag = realizedPnlCalculator.resultTagFor(realizedPnl);
        entry.setTags(tagService.resolveTags(user, resultTag != null ? List.of(resultTag) : List.of()));
        return saveAndNotify(entry);
    }

    public List<JournalEntry> getEntriesForUser() {
        return journalEntryRepository.findByUserIdOrderByTimestampDesc(getCurrentUserId());
    }

    public JournalEntry getEntry(int id) {
        JournalEntry entry = journalEntryRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Journal entry not found"));
        if (entry.getUser().getId() != getCurrentUserId()) {
            throw new IllegalArgumentException("Journal entry not found");
        }
        return entry;
    }

    public List<JournalEntry> getEntriesForUserAndTicker(String ticker) {
        return journalEntryRepository.findByUserIdAndTicker(getCurrentUserId(), ticker);
    }

    public List<JournalEntry> getEntriesInRange(Instant from, Instant to) {
        return journalEntryRepository.findByUserIdAndTimestampBetween(getCurrentUserId(), from, to);
    }

    public List<JournalEntry> getFilteredEntries(Instant from, Instant to, List<String> types, String ticker, List<Integer> tagIds, String query, List<LocalDate> dates) {
        List<JournalEntry> entries = journalEntryRepository.findByUserIdOrderByTimestampDesc(getCurrentUserId());
        return entries.stream()
            .filter(JournalEntryFilters.matching(from, to, types, ticker, tagIds, query))
            .filter(JournalEntryFilters.onDates(dates))
            .collect(Collectors.toList());
    }

    public List<CalendarDayDTO> getCalendarEntries(int year, int month, Instant from, Instant to, List<String> types, String ticker, List<Integer> tagIds, String query) {
        YearMonth yearMonth = YearMonth.of(year, month);
        Instant start = yearMonth.atDay(1).atStartOfDay(JournalEntryFilters.MARKET_ZONE).toInstant();
        Instant end = yearMonth.plusMonths(1).atDay(1).atStartOfDay(JournalEntryFilters.MARKET_ZONE).toInstant();
        List<JournalEntry> entries = journalEntryRepository.findByUserIdAndTimestampGreaterThanEqualAndTimestampLessThan(getCurrentUserId(), start, end);

        Map<LocalDate, Integer> counts = new HashMap<>();
        var matches = JournalEntryFilters.matching(from, to, types, ticker, tagIds, query);
        for (JournalEntry entry : entries) {
            if (!matches.test(entry)) continue;

            LocalDate date = entry.getTimestamp().atZone(JournalEntryFilters.MARKET_ZONE).toLocalDate();
            counts.merge(date, 1, Integer::sum);
        }

        return counts.entrySet().stream()
            .map(e -> new CalendarDayDTO(e.getKey().toString(), e.getValue()))
            .collect(Collectors.toList());
    }

    public void deleteEntry(int id) {
        int userId = getCurrentUserId();
        JournalEntry entry = journalEntryRepository.findOwnedEntryForUpdate(id, userId)
            .orElseThrow(() -> new RuntimeException("Journal entry not found"));
        if (entry.getUser().getId() != userId) {
            throw new RuntimeException("Journal entry not found");
        }
        for (JournalEntry reflection : journalEntryRepository.findByUserIdAndSourceEntryId(userId, id)) {
            reflection.setSourceEntryId(null);
            reflection.setEntryType(JournalEntryType.INSIGHT);
            // hindsight reads the type, so the orphaned reflection is re-read too
            entryEvents.changed(reflection.getId());
        }
        journalEntryRepository.deleteById(id);
        entryEvents.changed(id);
    }

    private JournalEntry saveAndNotify(JournalEntry entry) {
        JournalEntry saved = journalEntryRepository.save(entry);
        entryEvents.changed(saved.getId());
        return saved;
    }

    public JournalEntry updateEntry(int id, String body, List<String> tagNames) {
        int userId = getCurrentUserId();
        JournalEntry entry = journalEntryRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("Journal entry not found"));
        if (entry.getUser().getId() != userId) {
            throw new RuntimeException("Journal entry not found");
        }
        entry.setBody(body);
        List<String> combinedTags = new ArrayList<>();
        if (tagNames != null) {
            combinedTags.addAll(tagNames);
        }
        String autoTag = computeAutoTagForSellEntry(entry.getUser(), entry);
        if (autoTag != null && !combinedTags.contains(autoTag)) {
            combinedTags.add(autoTag);
        }
        entry.setTags(tagService.resolveTags(getCurrentUser(), combinedTags));
        return saveAndNotify(entry);
    }

    private String computeAutoTagForSellEntry(User user, JournalEntry entry) {
        if (entry.getEntryType() != JournalEntryType.SELL || entry.getTicker() == null || entry.getTicker().isBlank()) {
            return null;
        }
        if (entry.getPriceSnapshot() == null) {
            return null;
        }
        List<Transaction> transactions = transactionRepository.findByUserIdAndTicker(user.getId(), entry.getTicker());
        Double realizedPnl = realizedPnlCalculator.computeRealizedPnl(transactions, entry.getTicker(), entry.getTimestamp(), 1, entry.getPriceSnapshot());
        return realizedPnlCalculator.resultTagFor(realizedPnl);
    }
}
