package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.model.JournalEntry;
import com.github.fabianjim.portfoliomonitor.model.Stock;
import com.github.fabianjim.portfoliomonitor.model.User;
import com.github.fabianjim.portfoliomonitor.repository.JournalEntryRepository;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Service
@Transactional
public class JournalEntryService {

    private final JournalEntryRepository journalEntryRepository;
    private final StockService stockService;

    public JournalEntryService(JournalEntryRepository journalEntryRepository, StockService stockService) {
        this.journalEntryRepository = journalEntryRepository;
        this.stockService = stockService;
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

    public JournalEntry createEntry(JournalEntry entry) {
        entry.setUser(getCurrentUser());
        if (entry.getTimestamp() == null) {
            entry.setTimestamp(Instant.now());
        }

        if (entry.getTicker() != null && !entry.getTicker().isBlank()) {
            Optional<Stock> stockOpt = stockService.getLatestStockData(entry.getTicker());
            entry.setPriceSnapshot(stockOpt.map(Stock::getCurrentPrice).orElse(0.0));
        } else {
            entry.setPriceSnapshot(null);
        }

        return journalEntryRepository.save(entry);
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
}
