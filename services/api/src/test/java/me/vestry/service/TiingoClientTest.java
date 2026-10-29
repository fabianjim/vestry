package me.vestry.service;

import me.vestry.api.TiingoClient;
import me.vestry.exception.PriceFetchException;
import me.vestry.exception.UnknownTickerException;
import me.vestry.model.Stock;
import me.vestry.model.Stock.StockType;

import me.vestry.api.DailyClose;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.List;

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

    @Test
    void parseDailyClosesReadsTheTradingDayAndAdjustedCloseOldestFirst() {
        String json = "[{\"date\":\"2026-03-03T00:00:00.000Z\",\"close\":120.0,\"adjClose\":119.5},"
                + "{\"date\":\"2026-03-02T00:00:00.000Z\",\"adjClose\":118.0},"
                + "{\"date\":\"2026-03-04\",\"adjClose\":null},{\"adjClose\":121.0},"
                + "{\"date\":\"2026-03-05T00:00:00.000Z\",\"adjClose\":0}]";

        assertEquals(List.of(new DailyClose(LocalDate.of(2026, 3, 2), 118.0), new DailyClose(LocalDate.of(2026, 3, 3), 119.5)),
                tiingoClient.parseDailyCloses(json, "NVDA"));
        assertEquals(List.of(), tiingoClient.parseDailyCloses("[]", "NVDA"));
        assertThrows(PriceFetchException.class, () -> tiingoClient.parseDailyCloses("{\"detail\":\"x\"}", "NVDA"));
    }
}
