package me.vestry.service;

import me.vestry.api.BatchStockResult;
import me.vestry.api.MarketDataClient;
import me.vestry.event.PriceFetchCompletedEvent;
import me.vestry.model.Stock;
import me.vestry.repository.TrackedStockRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.ArrayList;
import java.util.logging.Handler;
import java.util.logging.LogRecord;
import java.util.logging.Logger;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ScheduledStockServiceTest {
    @Mock private StockService stockService;
    @Mock private TrackedStockRepository trackedStockRepository;
    @Mock private ApplicationEventPublisher eventPublisher;
    @Mock private MarketScheduleService marketSchedule;
    @Mock private MarketDataClient marketDataClient;
    @Mock private PlatformTransactionManager transactionManager;
    private ScheduledStockService scheduledStockService;
    private final List<String> messages = new ArrayList<>();
    private final Handler logHandler = new Handler() {
        public void publish(LogRecord record) { messages.add(record.getMessage()); }
        public void flush() {}
        public void close() {}
    };

    @BeforeEach
    void setUp() {
        Logger.getLogger(ScheduledStockService.class.getName()).addHandler(logHandler);
        scheduledStockService = new ScheduledStockService(stockService, trackedStockRepository,
                eventPublisher, marketSchedule, marketDataClient, transactionManager, 2);
    }

    @AfterEach
    void removeLogHandler() {
        Logger.getLogger(ScheduledStockService.class.getName()).removeHandler(logHandler);
    }

    private Stock stock(String ticker) {
        Stock stock = new Stock();
        stock.setTicker(ticker);
        return stock;
    }

    private void openMarket(List<String> tickers) {
        when(marketSchedule.isTradingDayToday()).thenReturn(true);
        when(trackedStockRepository.findAllActiveTickers()).thenReturn(tickers);
        when(transactionManager.getTransaction(any())).thenAnswer(i -> new SimpleTransactionStatus());
    }

    @Test
    void intradaySplitsChunksDeduplicatesAndPublishesAfterCommits() {
        openMarket(List.of("AAPL", "MSFT", "NVDA", "AAPL"));
        Stock apple = stock("AAPL");
        Stock microsoft = stock("MSFT");
        Stock nvidia = stock("NVDA");
        when(marketDataClient.getStockDataBatch(List.of("AAPL", "MSFT"), Stock.StockType.INTRADAY))
                .thenReturn(new BatchStockResult(Map.of("AAPL", apple, "MSFT", microsoft), Map.of(), true));
        when(marketDataClient.getStockDataBatch(List.of("NVDA"), Stock.StockType.INTRADAY))
                .thenReturn(new BatchStockResult(Map.of("NVDA", nvidia), Map.of(), true));

        scheduledStockService.fetchIntradayStocks();

        var order = inOrder(stockService, transactionManager, eventPublisher);
        order.verify(stockService).saveFetchedStock(apple);
        order.verify(transactionManager).commit(any());
        order.verify(stockService).saveFetchedStock(microsoft);
        order.verify(transactionManager).commit(any());
        order.verify(stockService).saveFetchedStock(nvidia);
        order.verify(transactionManager).commit(any());
        ArgumentCaptor<PriceFetchCompletedEvent> event = ArgumentCaptor.forClass(PriceFetchCompletedEvent.class);
        order.verify(eventPublisher).publishEvent(event.capture());
        assertEquals(3, event.getValue().getTickerCount());
        assertFalse(event.getValue().isEod());
        verify(stockService, never()).updateStockData(anyString(), any());
        verify(marketDataClient, times(2)).getStockDataBatch(anyList(), any());
    }

    @Test
    void eodFetchPublishesCompletionEvent() {
        openMarket(List.of("TSLA"));
        when(marketDataClient.getStockDataBatch(List.of("TSLA"), Stock.StockType.EOD))
                .thenReturn(new BatchStockResult(Map.of("TSLA", stock("TSLA")), Map.of(), true));
        scheduledStockService.fetchEODStocks();
        ArgumentCaptor<PriceFetchCompletedEvent> event = ArgumentCaptor.forClass(PriceFetchCompletedEvent.class);
        verify(eventPublisher).publishEvent(event.capture());
        assertEquals(1, event.getValue().getTickerCount());
        assertTrue(event.getValue().isEod());
    }

    @Test
    void wholeRequestFailureStopsLaterChunksWithoutMarkingThemAttempted() {
        openMarket(List.of("AAPL", "MSFT", "NVDA"));
        when(marketDataClient.getStockDataBatch(anyList(), any())).thenThrow(new RuntimeException("unavailable"));
        scheduledStockService.fetchIntradayStocks();
        verify(marketDataClient, times(1)).getStockDataBatch(anyList(), any());
        verify(trackedStockRepository).markFetchAttempt(eq("AAPL"), any(Instant.class));
        verify(trackedStockRepository).markFetchAttempt(eq("MSFT"), any(Instant.class));
        verify(trackedStockRepository, never()).markFetchAttempt(eq("NVDA"), any());
        verifyNoInteractions(stockService);
        verify(eventPublisher).publishEvent(any(PriceFetchCompletedEvent.class));
    }

    @Test
    void commitFailureIsRecordedAndDoesNotStopNextTicker() {
        openMarket(List.of("AAPL", "MSFT"));
        Stock microsoft = stock("MSFT");
        when(marketDataClient.getStockDataBatch(anyList(), any()))
                .thenReturn(new BatchStockResult(Map.of("AAPL", stock("AAPL"), "MSFT", microsoft), Map.of(), true));
        doThrow(new RuntimeException("commit failed")).doNothing().when(transactionManager).commit(any());
        scheduledStockService.fetchIntradayStocks();
        verify(trackedStockRepository).markFetchAttempt(eq("AAPL"), any());
        verify(stockService).saveFetchedStock(microsoft);
        verify(eventPublisher).publishEvent(any(PriceFetchCompletedEvent.class));
    }

    @Test
    void failureAccountingOutageDoesNotStopValidResults() {
        openMarket(List.of("AAPL", "MSFT"));
        Stock microsoft = stock("MSFT");
        when(marketDataClient.getStockDataBatch(anyList(), any()))
                .thenReturn(new BatchStockResult(Map.of("MSFT", microsoft), Map.of("AAPL", "No observation returned"), true));
        when(trackedStockRepository.markFetchAttempt(eq("AAPL"), any())).thenThrow(new RuntimeException("database unavailable"));
        scheduledStockService.fetchIntradayStocks();
        verify(transactionManager).rollback(any());
        verify(stockService).saveFetchedStock(microsoft);
        verify(eventPublisher).publishEvent(any(PriceFetchCompletedEvent.class));
    }

    @Test
    void closedDaySkipsBothBatchesAndCompletionEvents() {
        when(marketSchedule.isTradingDayToday()).thenReturn(false);
        scheduledStockService.fetchIntradayStocks();
        scheduledStockService.fetchEODStocks();
        verifyNoInteractions(stockService, trackedStockRepository, marketDataClient, eventPublisher, transactionManager);
    }

    @Test
    void noTickersDoesNotPublishEvent() {
        when(marketSchedule.isTradingDayToday()).thenReturn(true);
        when(trackedStockRepository.findAllActiveTickers()).thenReturn(List.of());
        scheduledStockService.fetchIntradayStocks();
        verifyNoInteractions(stockService, marketDataClient, eventPublisher, transactionManager);
    }
    @Test
    void localRejectionsMakeZeroRequestsAndDoNotSkipTheNextChunk() {
        openMarket(List.of("BAD/TICKER", " ", "AAPL"));
        when(marketDataClient.getStockDataBatch(List.of("BAD/TICKER", " "), Stock.StockType.INTRADAY))
                .thenReturn(new BatchStockResult(Map.of(), Map.of("BAD/TICKER", "Invalid ticker format", " ", "Invalid ticker format"), false));
        when(marketDataClient.getStockDataBatch(List.of("AAPL"), Stock.StockType.INTRADAY))
                .thenReturn(new BatchStockResult(Map.of("AAPL", stock("AAPL")), Map.of(), true));
        scheduledStockService.fetchIntradayStocks();
        verify(trackedStockRepository).markFetchAttempt(eq("BAD/TICKER"), any());
        verify(trackedStockRepository).markFetchAttempt(eq(" "), any());
        verify(stockService).saveFetchedStock(any());
        verify(eventPublisher).publishEvent(any(PriceFetchCompletedEvent.class));
        assertTrue(messages.stream().anyMatch(message -> message.contains(
                "requests=1 attempted=3 successful=1 failed=2 skipped=0")));
    }

    @Test
    void allInvalidRunLogsZeroRequestsAndStillCompletes() {
        openMarket(List.of("BAD/TICKER"));
        when(marketDataClient.getStockDataBatch(anyList(), any()))
                .thenReturn(new BatchStockResult(Map.of(), Map.of("BAD/TICKER", "Invalid ticker format"), false));
        scheduledStockService.fetchIntradayStocks();
        verifyNoInteractions(stockService);
        verify(eventPublisher).publishEvent(any(PriceFetchCompletedEvent.class));
        assertTrue(messages.stream().anyMatch(message -> message.contains(
                "requests=0 attempted=1 successful=0 failed=1 skipped=0")));
    }

    @Test
    void invalidBatchSizeFailsAtStartup() {
        assertThrows(IllegalArgumentException.class, () -> new ScheduledStockService(stockService,
                trackedStockRepository, eventPublisher, marketSchedule, marketDataClient, transactionManager, 0));
    }

}
