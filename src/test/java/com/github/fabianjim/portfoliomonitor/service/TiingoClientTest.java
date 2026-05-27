package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.api.TiingoClient;
import com.github.fabianjim.portfoliomonitor.exception.PriceFetchException;
import com.github.fabianjim.portfoliomonitor.exception.UnknownTickerException;
import com.github.fabianjim.portfoliomonitor.model.Stock;
import com.github.fabianjim.portfoliomonitor.model.Stock.StockType;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(MockitoExtension.class)
public class TiingoClientTest {

    @InjectMocks
    private TiingoClient tiingoClient;

    @Test
    void parseStockDataReturnsStockForValidJson() {
        String json = "[{\"timestamp\":\"2025-08-01T14:30:00.000Z\",\"tngoLast\":200.0,\"open\":195.0,\"prevClose\":190.0,\"high\":201.0,\"low\":199.0}]";

        Stock stock = tiingoClient.parseStockData(json, "AAPL", StockType.INITIAL);

        assertNotNull(stock);
        assertEquals("AAPL", stock.getTicker());
        assertEquals(200.0, stock.getCurrentPrice());
        assertEquals(195.0, stock.getOpen());
        assertEquals(190.0, stock.getPrevClose());
        assertEquals(201.0, stock.getHigh());
        assertEquals(199.0, stock.getLow());
    }

    @Test
    void parseStockDataThrowsUnknownTickerForEmptyArray() {
        String json = "[]";

        UnknownTickerException exception = assertThrows(UnknownTickerException.class, () -> {
            tiingoClient.parseStockData(json, "NIKE", StockType.INITIAL);
        });

        assertEquals("Ticker 'NIKE' does not exist. Please check the symbol and try again.", exception.getMessage());
    }

    @Test
    void parseStockDataThrowsPriceFetchExceptionForInvalidJson() {
        String json = "not valid json";

        PriceFetchException exception = assertThrows(PriceFetchException.class, () -> {
            tiingoClient.parseStockData(json, "AAPL", StockType.INITIAL);
        });

        assertTrue(exception.getMessage().contains("Error parsing JSON response"));
    }
}
