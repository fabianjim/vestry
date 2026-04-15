package com.github.fabianjim.portfoliomonitor.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.fabianjim.portfoliomonitor.model.JournalEntry;
import com.github.fabianjim.portfoliomonitor.model.JournalEntryType;
import com.github.fabianjim.portfoliomonitor.model.User;
import com.github.fabianjim.portfoliomonitor.service.JournalEntryService;
import com.github.fabianjim.portfoliomonitor.service.UserService;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(JournalEntryController.class)
public class JournalEntryControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JournalEntryService journalEntryService;

    @MockitoBean
    private UserService userService;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    @WithMockUser(username = "testuser")
    void createJournalEntry() throws Exception {
        User user = new User();
        user.setId(1);
        user.setUsername("testuser");

        JournalEntry entry = new JournalEntry();
        entry.setId(1);
        entry.setEntryType(JournalEntryType.BUY);
        entry.setBody("Bought AAPL");
        entry.setTicker("AAPL");
        entry.setTimestamp(Instant.now());
        entry.setPriceSnapshot(150.0);
        entry.setUser(user);

        when(journalEntryService.createEntry(any(JournalEntry.class))).thenReturn(entry);

        mockMvc.perform(post("/api/journal")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(entry)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(1))
            .andExpect(jsonPath("$.entryType").value("BUY"))
            .andExpect(jsonPath("$.body").value("Bought AAPL"))
            .andExpect(jsonPath("$.ticker").value("AAPL"))
            .andExpect(jsonPath("$.priceSnapshot").value(150.0));
    }

    @Test
    @WithMockUser(username = "testuser")
    void getJournalEntries() throws Exception {
        JournalEntry entry = new JournalEntry();
        entry.setId(1);
        entry.setEntryType(JournalEntryType.INSIGHT);
        entry.setBody("Market insight");

        when(journalEntryService.getEntriesForUser()).thenReturn(List.of(entry));

        mockMvc.perform(get("/api/journal"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].entryType").value("INSIGHT"));
    }

    @Test
    @WithMockUser(username = "testuser")
    void getJournalEntriesForTicker() throws Exception {
        JournalEntry entry = new JournalEntry();
        entry.setId(1);
        entry.setEntryType(JournalEntryType.SELL);
        entry.setTicker("AAPL");

        when(journalEntryService.getEntriesForUserAndTicker("AAPL")).thenReturn(List.of(entry));

        mockMvc.perform(get("/api/journal/AAPL"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].ticker").value("AAPL"));
    }
}
