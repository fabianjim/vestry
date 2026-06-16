package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.event.PriceFetchCompletedEvent;
import com.github.fabianjim.portfoliomonitor.model.Stock;
import com.github.fabianjim.portfoliomonitor.model.TrackedStock;
import com.github.fabianjim.portfoliomonitor.repository.TrackedStockRepository;
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

    @InjectMocks
    private ScheduledStockService scheduledStockService;

    @Test
    void intradayFetchPublishesCompletionEvent() {
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
    void noTickersDoesNotPublishEvent() {
        when(trackedStockRepository.findAllActiveTickers()).thenReturn(List.of());

        scheduledStockService.fetchIntradayStocks();

        verify(eventPublisher, never()).publishEvent(any());
    }
}
