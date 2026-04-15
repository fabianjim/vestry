package com.github.fabianjim.portfoliomonitor.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.fabianjim.portfoliomonitor.model.StockMetadata;
import com.github.fabianjim.portfoliomonitor.model.User;
import com.github.fabianjim.portfoliomonitor.model.WatchlistItem;
import com.github.fabianjim.portfoliomonitor.service.UserService;
import com.github.fabianjim.portfoliomonitor.service.WatchlistService;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(WatchlistController.class)
public class WatchlistControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private WatchlistService watchlistService;

    @MockitoBean
    private UserService userService;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    @WithMockUser(username = "testuser")
    void addToWatchlist() throws Exception {
        User user = new User();
        user.setId(1);
        user.setUsername("testuser");

        WatchlistItem item = new WatchlistItem();
        item.setId(1);
        item.setTicker("AAPL");
        item.setUser(user);

        when(watchlistService.addToWatchlist("AAPL")).thenReturn(item);

        mockMvc.perform(post("/api/watchlist")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("ticker", "AAPL"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.ticker").value("AAPL"));
    }

    @Test
    @WithMockUser(username = "testuser")
    void getWatchlist() throws Exception {
        User user = new User();
        user.setId(1);

        WatchlistItem item = new WatchlistItem();
        item.setId(1);
        item.setTicker("AAPL");
        item.setUser(user);

        StockMetadata metadata = new StockMetadata();
        metadata.setTicker("AAPL");
        metadata.setSector("Technology");
        metadata.setMarketCapTier("LARGE_CAP");
        item.setMetadata(metadata);

        when(watchlistService.getWatchlistForUser()).thenReturn(List.of(item));

        mockMvc.perform(get("/api/watchlist"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].ticker").value("AAPL"))
            .andExpect(jsonPath("$[0].metadata.sector").value("Technology"));
    }

    @Test
    @WithMockUser(username = "testuser")
    void removeFromWatchlist() throws Exception {
        mockMvc.perform(delete("/api/watchlist/AAPL").with(csrf()))
            .andExpect(status().isOk());
    }
}
