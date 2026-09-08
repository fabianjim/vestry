package me.vestry.service;

import me.vestry.event.PriceFetchCompletedEvent;
import me.vestry.model.Stock;
import me.vestry.model.TrackedStock;
import me.vestry.repository.TrackedStockRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ScheduledStockServiceTest {

    @Mock
    private StockService stockService;

    @Mock
    private TrackedStockRepository trackedStockRepository;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @Mock
    private MarketScheduleService marketSchedule;

    @InjectMocks
    private ScheduledStockService scheduledStockService;

    @Test
    void intradayFetchPublishesCompletionEvent() {
        when(marketSchedule.isTradingDayToday()).thenReturn(true);
        when(trackedStockRepository.findAllActiveTickers()).thenReturn(List.of("AAPL", "MSFT"));
        when(stockService.updateStockData("AAPL", Stock.StockType.INTRADAY)).thenReturn(new Stock());
        when(stockService.updateStockData("MSFT", Stock.StockType.INTRADAY)).thenReturn(new Stock());
        when(trackedStockRepository.findByTicker(anyString())).thenReturn(java.util.Optional.of(new TrackedStock()));
        when(trackedStockRepository.save(any(TrackedStock.class))).thenAnswer(i -> i.getArgument(0));

        scheduledStockService.fetchIntradayStocks();

        ArgumentCaptor<PriceFetchCompletedEvent> captor = ArgumentCaptor.forClass(PriceFetchCompletedEvent.class);
        verify(eventPublisher).publishEvent(captor.capture());
        PriceFetchCompletedEvent event = captor.getValue();
        assertEquals(2, event.getTickerCount());
        assertFalse(event.isEod());
    }

    @Test
    void eodFetchPublishesCompletionEvent() {
        when(marketSchedule.isTradingDayToday()).thenReturn(true);
        when(trackedStockRepository.findAllActiveTickers()).thenReturn(List.of("TSLA"));
        when(stockService.updateStockData("TSLA", Stock.StockType.EOD)).thenReturn(new Stock());
        when(trackedStockRepository.findByTicker("TSLA")).thenReturn(java.util.Optional.of(new TrackedStock()));
        when(trackedStockRepository.save(any(TrackedStock.class))).thenAnswer(i -> i.getArgument(0));

        scheduledStockService.fetchEODStocks();

        ArgumentCaptor<PriceFetchCompletedEvent> captor = ArgumentCaptor.forClass(PriceFetchCompletedEvent.class);
        verify(eventPublisher).publishEvent(captor.capture());
        PriceFetchCompletedEvent event = captor.getValue();
        assertEquals(1, event.getTickerCount());
        assertTrue(event.isEod());
    }

    @Test
    void closedDaySkipsBothBatchesAndCompletionEvents() {
        when(marketSchedule.isTradingDayToday()).thenReturn(false);
        scheduledStockService.fetchIntradayStocks();
        scheduledStockService.fetchEODStocks();
        verifyNoInteractions(stockService, trackedStockRepository, eventPublisher);
    }

    @Test
    void noTickersDoesNotPublishEvent() {
        when(marketSchedule.isTradingDayToday()).thenReturn(true);
        when(trackedStockRepository.findAllActiveTickers()).thenReturn(List.of());

        scheduledStockService.fetchIntradayStocks();

        verify(eventPublisher, never()).publishEvent(any());
    }
}
