package com.github.fabianjim.portfoliomonitor.controller;

import com.github.fabianjim.portfoliomonitor.model.JournalEntry;
import com.github.fabianjim.portfoliomonitor.service.JournalEntryService;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/journal")
public class JournalEntryController {

    private final JournalEntryService journalEntryService;

    public JournalEntryController(JournalEntryService journalEntryService) {
        this.journalEntryService = journalEntryService;
    }

    @PostMapping
    public JournalEntry createEntry(@RequestBody JournalEntry entry) {
        return journalEntryService.createEntry(entry);
    }

    @GetMapping
    public List<JournalEntry> getEntries() {
        return journalEntryService.getEntriesForUser();
    }

    @GetMapping("/{ticker}")
    public List<JournalEntry> getEntriesForTicker(@PathVariable String ticker) {
        return journalEntryService.getEntriesForUserAndTicker(ticker);
    }

    @GetMapping("/range")
    public List<JournalEntry> getEntriesInRange(@RequestParam Instant from, @RequestParam Instant to) {
        return journalEntryService.getEntriesInRange(from, to);
    }
}
