package me.vestry.service;

import me.vestry.api.TiingoClient;
import me.vestry.model.Stock;
import me.vestry.model.Stock.StockType;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

import java.time.Instant;


@SpringBootTest
@TestPropertySource(locations = "classpath:application-test.properties")
public class TiingoAPIIntegrationTest {

    @MockitoBean
    private TiingoClient tiingoClient;

    @Test
    void testConnectionToTiingo() {
        when(tiingoClient.testConnection()).thenReturn("You successfully sent a request");

        String response = tiingoClient.testConnection();

        assertNotNull(response);
        assertTrue(response.contains("You successfully sent a request"));
    }

    @Test
    public void testGetCurrentPrice() {
        when(tiingoClient.getCurrentPrice("AAPL")).thenReturn(150.0);

        double price = tiingoClient.getCurrentPrice("AAPL");

        assertNotNull(price);
        assertEquals(150.0, price);
    }

    @Test
    public void testGetStockData() {
        Stock mockStock = new Stock();
        mockStock.setCurrentPrice(200);
        mockStock.setTimestamp(Instant.parse("2025-08-01T14:30:00Z"));
        mockStock.setHourBucket(Instant.parse("2025-08-01T14:00:00Z"));
        mockStock.setOpen(195);
        mockStock.setHigh(201);
        mockStock.setLow(199);
        mockStock.setPrevClose(190);

        when(tiingoClient.getStockData("AAPL", StockType.INITIAL)).thenReturn(mockStock);

        Stock apple = tiingoClient.getStockData("AAPL", StockType.INITIAL);

        assertEquals(200, apple.getCurrentPrice());
        assertEquals(Instant.parse("2025-08-01T14:30:00Z"), apple.getTimestamp());
        assertEquals(195, apple.getOpen());
        assertEquals(201, apple.getHigh());
        assertEquals(199, apple.getLow());
        assertEquals(190, apple.getPrevClose());
    }
}