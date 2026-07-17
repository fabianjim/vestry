package com.github.fabianjim.portfoliomonitor.controller;

import com.github.fabianjim.portfoliomonitor.dto.CalendarDayDTO;
import com.github.fabianjim.portfoliomonitor.dto.CreateJournalEntryRequest;
import com.github.fabianjim.portfoliomonitor.dto.UpdateJournalEntryRequest;
import com.github.fabianjim.portfoliomonitor.model.DemoSession;
import com.github.fabianjim.portfoliomonitor.model.JournalEntry;
import com.github.fabianjim.portfoliomonitor.model.User;
import com.github.fabianjim.portfoliomonitor.service.DemoSessionResolver;
import com.github.fabianjim.portfoliomonitor.service.DemoSessionService;
import com.github.fabianjim.portfoliomonitor.service.JournalEntryService;
import com.github.fabianjim.portfoliomonitor.service.TagService;
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
    private final TagService tagService;

    public JournalEntryController(JournalEntryService journalEntryService,
                                  DemoSessionResolver demoSessionResolver,
                                  DemoSessionService demoSessionService,
                                  TagService tagService) {
        this.journalEntryService = journalEntryService;
        this.demoSessionResolver = demoSessionResolver;
        this.demoSessionService = demoSessionService;
        this.tagService = tagService;
    }

    private JournalEntry buildEntryFromDto(CreateJournalEntryRequest dto) {
        JournalEntry entry = new JournalEntry();
        entry.setEntryType(dto.getEntryType());
        entry.setBody(dto.getBody());
        entry.setTicker(dto.getTicker());
        entry.setTimestamp(dto.getTimestamp());
        entry.setPriceSnapshot(dto.getPriceSnapshot());
        return entry;
    }

    @PostMapping
    public JournalEntry createEntry(@RequestBody CreateJournalEntryRequest dto, HttpServletRequest request) {
        JournalEntry entry = buildEntryFromDto(dto);
        if (demoSessionResolver.isDemoUser()) {
            DemoSession session = demoSessionResolver.resolveSession(request);
            User user = demoSessionResolver.getCurrentUser();
            return demoSessionService.createJournalEntry(session, user, entry, dto.getTags());
        }
        return journalEntryService.createEntry(entry, dto.getTags());
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

    @GetMapping("/filtered")
    public List<JournalEntry> getFilteredEntries(
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(required = false) List<String> types,
            @RequestParam(required = false) String ticker,
            @RequestParam(required = false) List<Integer> tagIds,
            @RequestParam(required = false) String query,
            HttpServletRequest request) {
        if (demoSessionResolver.isDemoUser()) {
            return demoSessionService.getFilteredJournalEntries(demoSessionResolver.resolveSession(request), from, to, types, ticker, tagIds, query);
        }
        return journalEntryService.getFilteredEntries(from, to, types, ticker, tagIds, query);
    }

    @GetMapping("/calendar")
    public List<CalendarDayDTO> getCalendarEntries(
            @RequestParam int year,
            @RequestParam int month,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(required = false) List<String> types,
            @RequestParam(required = false) String ticker,
            @RequestParam(required = false) List<Integer> tagIds,
            @RequestParam(required = false) String query,
            HttpServletRequest request) {
        if (demoSessionResolver.isDemoUser()) {
            return demoSessionService.getJournalCalendarEntries(demoSessionResolver.resolveSession(request), year, month, from, to, types, ticker, tagIds, query);
        }
        return journalEntryService.getCalendarEntries(year, month, from, to, types, ticker, tagIds, query);
    }

    @GetMapping("/tags/popular")
    public List<com.github.fabianjim.portfoliomonitor.model.Tag> getPopularTags(
            @RequestParam(required = false, defaultValue = "") String query,
            @RequestParam(required = false, defaultValue = "3") int limit,
            HttpServletRequest request) {
        User user = demoSessionResolver.getCurrentUser();
        return tagService.findPopularTags(user, query, limit);
    }

    @DeleteMapping("/tags/{id}")
    public void deleteTag(@PathVariable int id, HttpServletRequest request) {
        User user = demoSessionResolver.getCurrentUser();
        tagService.deleteTag(user.getId(), id);
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
    public JournalEntry updateEntry(@PathVariable int id, @RequestBody UpdateJournalEntryRequest dto, HttpServletRequest request) {
        if (demoSessionResolver.isDemoUser()) {
            DemoSession session = demoSessionResolver.resolveSession(request);
            User user = demoSessionResolver.getCurrentUser();
            return demoSessionService.updateJournalEntry(session, user, id, dto.getBody(), dto.getTags());
        }
        return journalEntryService.updateEntry(id, dto.getBody(), dto.getTags());
    }
}
