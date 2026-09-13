package me.vestry.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import me.vestry.model.JournalEntry;
import me.vestry.model.JournalEntryType;
import me.vestry.model.User;
import me.vestry.service.DemoSessionResolver;
import me.vestry.service.DemoSessionService;
import me.vestry.service.JournalEntryService;
import me.vestry.service.TagService;
import me.vestry.service.UserService;

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
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(JournalEntryController.class)
public class JournalEntryControllerTest {

    @Test
    @WithMockUser
    void createReflectionUsesExistingEndpointAndPassesSourceId() throws Exception {
        when(journalEntryService.createEntry(any(JournalEntry.class), any())).thenAnswer(call -> call.getArgument(0));
        mockMvc.perform(post("/api/journal").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"entryType\":\"REFLECTION\",\"sourceEntryId\":7,\"body\":\"Looking back\",\"tags\":[]}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entryType").value("REFLECTION"))
            .andExpect(jsonPath("$.sourceEntryId").value(7));
    }

    @Test
    @WithMockUser
    void lookupByIdDoesNotUseTickerRoute() throws Exception {
        JournalEntry source = new JournalEntry();
        source.setId(7);
        source.setBody("Current source text");
        when(journalEntryService.getEntry(7)).thenReturn(source);
        mockMvc.perform(get("/api/journal/entries/7"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.body").value("Current source text"));
    }

    @Test
    @WithMockUser
    void demoReflectionCreationAndLookupUseSession() throws Exception {
        me.vestry.model.DemoSession session = new me.vestry.model.DemoSession();
        User user = new User();
        user.setId(5);
        when(demoSessionResolver.isDemoUser()).thenReturn(true);
        when(demoSessionResolver.resolveSession(any())).thenReturn(session);
        when(demoSessionResolver.getCurrentUser()).thenReturn(user);
        when(demoSessionService.createJournalEntry(eq(session), eq(user), any(), any()))
            .thenAnswer(call -> call.getArgument(2));
        mockMvc.perform(post("/api/journal").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"entryType\":\"REFLECTION\",\"sourceEntryId\":-7,\"body\":\"Looking back\",\"tags\":[]}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.sourceEntryId").value(-7));
        JournalEntry source = new JournalEntry();
        source.setId(-7);
        when(demoSessionService.getJournalEntry(session, -7)).thenReturn(source);
        mockMvc.perform(get("/api/journal/entries/-7"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(-7));
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JournalEntryService journalEntryService;

    @MockitoBean
    private DemoSessionResolver demoSessionResolver;

    @MockitoBean
    private DemoSessionService demoSessionService;

    @MockitoBean
    private UserService userService;

    @MockitoBean
    private TagService tagService;

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

        when(journalEntryService.createEntry(any(JournalEntry.class), any())).thenReturn(entry);

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

    @Test
    @WithMockUser(username = "testuser")
    void deleteJournalEntry() throws Exception {
        mockMvc.perform(delete("/api/journal/1")
                .with(csrf()))
            .andExpect(status().isOk());
    }

    @Test
    @WithMockUser(username = "testuser")
    void updateJournalEntry() throws Exception {
        User user = new User();
        user.setId(1);
        user.setUsername("testuser");

        JournalEntry entry = new JournalEntry();
        entry.setId(1);
        entry.setEntryType(JournalEntryType.INSIGHT);
        entry.setBody("Updated insight");
        entry.setTimestamp(Instant.now());
        entry.setUser(user);

        when(journalEntryService.updateEntry(eq(1), eq("Updated insight"), any())).thenReturn(entry);

        JournalEntry updateRequest = new JournalEntry();
        updateRequest.setBody("Updated insight");

        mockMvc.perform(put("/api/journal/1")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(updateRequest)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(1))
            .andExpect(jsonPath("$.body").value("Updated insight"));
    }
}
