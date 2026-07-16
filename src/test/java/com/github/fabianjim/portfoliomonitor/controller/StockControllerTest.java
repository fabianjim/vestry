package com.github.fabianjim.portfoliomonitor.controller;

import com.github.fabianjim.portfoliomonitor.model.Stock;
import com.github.fabianjim.portfoliomonitor.model.TrackedStock;
import com.github.fabianjim.portfoliomonitor.repository.TrackedStockRepository;
import com.github.fabianjim.portfoliomonitor.service.DemoSessionResolver;
import com.github.fabianjim.portfoliomonitor.service.DemoSessionService;
import com.github.fabianjim.portfoliomonitor.service.PortfolioService;
import com.github.fabianjim.portfoliomonitor.service.StockService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(StockController.class)
public class StockControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private StockController stockController;

    @MockitoBean
    private StockService stockService;

    @MockitoBean
    private TrackedStockRepository trackedStockRepository;

    @MockitoBean
    private PortfolioService portfolioService;

    @MockitoBean
    private DemoSessionResolver demoSessionResolver;

    @MockitoBean
    private DemoSessionService demoSessionService;

    private Stock createStock(Stock.StockType type, Instant hourBucket) {
        return new Stock("AAPL", Instant.now(), 150.0, 148.0, 147.0, 151.0, 147.5, type, hourBucket);
    }

    // --- isEodData helper tests ---

    @Test
    void wedEodAtThursdayPreMarketIsEod() {
        // 9:44 AM Thursday
        ZonedDateTime now = ZonedDateTime.of(2026, 7, 16, 9, 44, 0, 0, ZoneId.of("America/New_York"));
        // Wednesday 4:00 PM hour bucket
        ZonedDateTime bucket = ZonedDateTime.of(2026, 7, 15, 16, 0, 0, 0, ZoneId.of("America/New_York"));
        Stock stock = createStock(Stock.StockType.EOD, bucket.toInstant());

        assertTrue(stockController.isEodData(stock, now));
    }

    @Test
    void wedEodAfterThursdayFirstFetchIsNotEod() {
        // 10:15 AM Thursday — after the first intraday fetch
        ZonedDateTime now = ZonedDateTime.of(2026, 7, 16, 10, 15, 0, 0, ZoneId.of("America/New_York"));
        ZonedDateTime bucket = ZonedDateTime.of(2026, 7, 15, 16, 0, 0, 0, ZoneId.of("America/New_York"));
        Stock stock = createStock(Stock.StockType.EOD, bucket.toInstant());

        assertFalse(stockController.isEodData(stock, now));
    }

    @Test
    void todayEodIsEod() {
        // 2:00 PM Thursday
        ZonedDateTime now = ZonedDateTime.of(2026, 7, 16, 14, 0, 0, 0, ZoneId.of("America/New_York"));
        ZonedDateTime bucket = ZonedDateTime.of(2026, 7, 16, 16, 0, 0, 0, ZoneId.of("America/New_York"));
        Stock stock = createStock(Stock.StockType.EOD, bucket.toInstant());

        assertTrue(stockController.isEodData(stock, now));
    }

    @Test
    void fridayEodValidThroughMonday() {
        // 9:30 AM Monday
        ZonedDateTime now = ZonedDateTime.of(2026, 7, 20, 9, 30, 0, 0, ZoneId.of("America/New_York"));
        ZonedDateTime bucket = ZonedDateTime.of(2026, 7, 17, 16, 0, 0, 0, ZoneId.of("America/New_York"));
        Stock stock = createStock(Stock.StockType.EOD, bucket.toInstant());

        assertTrue(stockController.isEodData(stock, now));
    }

    @Test
    void fridayEodValidOnSunday() {
        // 2:00 PM Sunday
        ZonedDateTime now = ZonedDateTime.of(2026, 7, 19, 14, 0, 0, 0, ZoneId.of("America/New_York"));
        ZonedDateTime bucket = ZonedDateTime.of(2026, 7, 17, 16, 0, 0, 0, ZoneId.of("America/New_York"));
        Stock stock = createStock(Stock.StockType.EOD, bucket.toInstant());

        assertTrue(stockController.isEodData(stock, now));
    }

    @Test
    void intradayDataIsNotEod() {
        ZonedDateTime now = ZonedDateTime.of(2026, 7, 16, 9, 44, 0, 0, ZoneId.of("America/New_York"));
        ZonedDateTime bucket = ZonedDateTime.of(2026, 7, 15, 16, 0, 0, 0, ZoneId.of("America/New_York"));
        Stock stock = createStock(Stock.StockType.INTRADAY, bucket.toInstant());

        assertFalse(stockController.isEodData(stock, now));
    }

    @Test
    void eodTwoDaysAgoIsNotEod() {
        // 9:44 AM Friday with Wednesday EOD (Thursday was a trading day, so should have Thu EOD)
        ZonedDateTime now = ZonedDateTime.of(2026, 7, 17, 9, 44, 0, 0, ZoneId.of("America/New_York"));
        ZonedDateTime bucket = ZonedDateTime.of(2026, 7, 15, 16, 0, 0, 0, ZoneId.of("America/New_York"));
        Stock stock = createStock(Stock.StockType.EOD, bucket.toInstant());

        assertFalse(stockController.isEodData(stock, now));
    }

    // --- Endpoint integration tests ---

    @Test
    @WithMockUser(username = "testuser")
    void getStockDataForTodayEodIsNotStale() throws Exception {
        Instant now = Instant.now();
        // Use today's date for the hour bucket so isEodData always returns true
        LocalDate today = LocalDate.now(ZoneId.of("America/New_York"));
        ZonedDateTime bucket = today.atTime(16, 0).atZone(ZoneId.of("America/New_York"));

        Stock stock = createStock(Stock.StockType.EOD, bucket.toInstant());
        stock.setTimestamp(now);
        TrackedStock tracked = new TrackedStock("AAPL");
        tracked.setLastSuccessfulFetch(now);

        when(stockService.getLatestStockData("AAPL")).thenReturn(Optional.of(stock));
        when(trackedStockRepository.findByTicker("AAPL")).thenReturn(Optional.of(tracked));

        mockMvc.perform(get("/api/stock/data/AAPL"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.eod").value(true))
            .andExpect(jsonPath("$.stale").value(false));
    }

    @Test
    @WithMockUser(username = "testuser")
    void getStockDataForOldIntradayIsStale() throws Exception {
        Instant now = Instant.now();
        // A stale intraday row from a week ago
        ZonedDateTime bucket = ZonedDateTime.now(ZoneId.of("America/New_York")).minusDays(7).withHour(16).withMinute(0);

        Stock stock = createStock(Stock.StockType.INTRADAY, bucket.toInstant());
        stock.setTimestamp(bucket.toInstant());
        TrackedStock tracked = new TrackedStock("AAPL");
        tracked.setLastSuccessfulFetch(bucket.toInstant());

        when(stockService.getLatestStockData("AAPL")).thenReturn(Optional.of(stock));
        when(trackedStockRepository.findByTicker("AAPL")).thenReturn(Optional.of(tracked));

        mockMvc.perform(get("/api/stock/data/AAPL"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.eod").value(false))
            .andExpect(jsonPath("$.stale").value(true));
    }
}
