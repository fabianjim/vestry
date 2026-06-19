package com.github.fabianjim.portfoliomonitor.controller;

import com.github.fabianjim.portfoliomonitor.model.DemoSession;
import com.github.fabianjim.portfoliomonitor.model.JournalEntry;
import com.github.fabianjim.portfoliomonitor.model.User;
import com.github.fabianjim.portfoliomonitor.service.DemoSessionResolver;
import com.github.fabianjim.portfoliomonitor.service.DemoSessionService;
import com.github.fabianjim.portfoliomonitor.service.JournalEntryService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/journal")
public class JournalEntryController {

    private final JournalEntryService journalEntryService;
    private final DemoSessionResolver demoSessionResolver;
    private final DemoSessionService demoSessionService;

    public JournalEntryController(JournalEntryService journalEntryService,
                                  DemoSessionResolver demoSessionResolver,
                                  DemoSessionService demoSessionService) {
        this.journalEntryService = journalEntryService;
        this.demoSessionResolver = demoSessionResolver;
        this.demoSessionService = demoSessionService;
    }

    @PostMapping
    public JournalEntry createEntry(@RequestBody JournalEntry entry, HttpServletRequest request) {
        if (demoSessionResolver.isDemoUser()) {
            DemoSession session = demoSessionResolver.resolveSession(request);
            User user = demoSessionResolver.getCurrentUser();
            return demoSessionService.createJournalEntry(session, user, entry);
        }
        return journalEntryService.createEntry(entry);
    }

    @GetMapping
    public List<JournalEntry> getEntries(HttpServletRequest request) {
        if (demoSessionResolver.isDemoUser()) {
            return demoSessionService.getJournalEntries(demoSessionResolver.resolveSession(request));
        }
        return journalEntryService.getEntriesForUser();
    }

    @GetMapping("/{ticker}")
    public List<JournalEntry> getEntriesForTicker(@PathVariable String ticker, HttpServletRequest request) {
        if (demoSessionResolver.isDemoUser()) {
            return demoSessionService.getJournalEntriesForTicker(demoSessionResolver.resolveSession(request), ticker);
        }
        return journalEntryService.getEntriesForUserAndTicker(ticker);
    }

    @GetMapping("/range")
    public List<JournalEntry> getEntriesInRange(@RequestParam Instant from, @RequestParam Instant to, HttpServletRequest request) {
        if (demoSessionResolver.isDemoUser()) {
            return demoSessionService.getJournalEntriesInRange(demoSessionResolver.resolveSession(request), from, to);
        }
        return journalEntryService.getEntriesInRange(from, to);
    }

    @DeleteMapping("/{id}")
    public void deleteEntry(@PathVariable int id, HttpServletRequest request) {
        if (demoSessionResolver.isDemoUser()) {
            demoSessionService.deleteJournalEntry(demoSessionResolver.resolveSession(request), id);
        } else {
            journalEntryService.deleteEntry(id);
        }
    }

    @PutMapping("/{id}")
    public JournalEntry updateEntry(@PathVariable int id, @RequestBody JournalEntry entry, HttpServletRequest request) {
        if (demoSessionResolver.isDemoUser()) {
            return demoSessionService.updateJournalEntry(demoSessionResolver.resolveSession(request), id, entry.getBody());
        }
        return journalEntryService.updateEntry(id, entry.getBody());
    }
}
