package me.vestry.service;

import me.vestry.api.BatchStockResult;
import me.vestry.api.MarketDataClient;
import me.vestry.api.TiingoClient;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import me.vestry.event.PriceFetchCompletedEvent;
import me.vestry.model.Stock;
import me.vestry.model.TrackedStock;
import me.vestry.repository.StockRepository;
import me.vestry.repository.TrackedStockRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.Set;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@DataJpaTest(properties = "spring.jpa.show-sql=false")
@ActiveProfiles("test")
@Import(StockService.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class ScheduledStockPersistenceTest {
    @Autowired private StockService stockService;
    @Autowired private StockRepository stocks;
    @Autowired private TrackedStockRepository tracked;
    @Autowired private PlatformTransactionManager transactionManager;
    @MockitoBean private MarketDataClient client;
    private TransactionTemplate tx;
    private final Instant previous = Instant.parse("2026-09-08T14:00:00Z");

    @BeforeEach
    void setUp() {
        tx = new TransactionTemplate(transactionManager);
        tx.executeWithoutResult(status -> {
            stocks.deleteAll();
            tracked.deleteAll();
        });
    }

    private Stock quote(String ticker) {
        Instant timestamp = Instant.parse("2026-09-09T14:00:01Z");
        return new Stock(ticker, timestamp, 200, 195, 190, 201, 194,
                Stock.StockType.INTRADAY, Instant.parse("2026-09-09T14:00:00Z"));
    }

    private void track(String ticker) {
        TrackedStock entry = new TrackedStock(ticker);
        entry.setLastSuccessfulFetch(previous);
        tracked.save(entry);
    }

    private ScheduledStockService scheduler(org.springframework.context.ApplicationEventPublisher publisher) {
        MarketScheduleService market = mock(MarketScheduleService.class);
        when(market.isTradingDayToday()).thenReturn(true);
        return new ScheduledStockService(stockService, tracked, publisher, market, client, transactionManager, 100);
    }

    @Test
    void failedTickerRollsBackAloneAndEventReadsCommittedResults() {
        track("AAPL");
        track("MSFT");
        track("NVDA");
        Stock invalid = quote("MSFT");
        invalid.setTimestamp(null); // Real persistence failure, not a mocked transaction.
        when(client.getStockDataBatch(anyList(), any())).thenAnswer(invocation -> {
            assertFalse(TransactionSynchronizationManager.isActualTransactionActive());
            return new BatchStockResult(Map.of("AAPL", quote("AAPL"), "MSFT", invalid, "NVDA", quote("NVDA")), Map.of(), true);
        });
        AtomicInteger events = new AtomicInteger();
        scheduler(event -> {
            assertInstanceOf(PriceFetchCompletedEvent.class, event);
            assertFalse(TransactionSynchronizationManager.isActualTransactionActive());
            assertEquals(2, stocks.count());
            assertTrue(stocks.existsByTicker("AAPL"));
            assertTrue(stocks.existsByTicker("NVDA"));
            assertFalse(stocks.existsByTicker("MSFT"));
            assertEquals(previous, tracked.findByTicker("MSFT").orElseThrow().getLastSuccessfulFetch());
            assertNotNull(tracked.findByTicker("MSFT").orElseThrow().getLastFetchAttempt());
            assertTrue(tracked.findByTicker("AAPL").orElseThrow().getLastSuccessfulFetch().isAfter(previous));
            events.incrementAndGet();
        }).fetchIntradayStocks();
        assertEquals(1, events.get());
    }

    @Test
    void duplicateObservationIsReusedWithoutChangingItsType() {
        track("AAPL");
        Stock existing = quote("AAPL");
        existing.setType(Stock.StockType.INITIAL);
        int id = stocks.save(existing).getId();
        when(client.getStockDataBatch(anyList(), any()))
                .thenReturn(new BatchStockResult(Map.of("AAPL", quote("AAPL")), Map.of(), true));
        scheduler(event -> {}).fetchIntradayStocks();
        assertEquals(1, stocks.count());
        assertEquals(Stock.StockType.INITIAL, stocks.findById(id).orElseThrow().getType());
        assertTrue(tracked.findByTicker("AAPL").orElseThrow().getLastSuccessfulFetch().isAfter(previous));
    }

    @Test
    void trackingChangesDuringFetchArePreservedAndDeletedRowsStayDeleted() {
        track("AAPL");
        track("MSFT");
        when(client.getStockDataBatch(anyList(), any())).thenAnswer(invocation -> {
            tx.executeWithoutResult(status -> {
                TrackedStock apple = tracked.findByTicker("AAPL").orElseThrow();
                apple.setHolderCount(4);
                tracked.save(apple);
                tracked.delete(tracked.findByTicker("MSFT").orElseThrow());
            });
            return new BatchStockResult(Map.of("AAPL", quote("AAPL"), "MSFT", quote("MSFT")), Map.of(), true);
        });
        scheduler(event -> {}).fetchIntradayStocks();
        assertEquals(4, tracked.findByTicker("AAPL").orElseThrow().getHolderCount());
        assertTrue(tracked.findByTicker("MSFT").isEmpty());
        assertEquals(2, stocks.count());
    }

    @Test
    void timestampUpdatesNeverMoveNewerFetchStatusBackwards() {
        track("AAPL");
        Instant newer = previous.plusSeconds(120);
        tx.executeWithoutResult(status -> tracked.markFetchSuccessful("AAPL", newer));
        tx.executeWithoutResult(status -> {
            tracked.markFetchSuccessful("AAPL", previous);
            tracked.markFetchAttempt("AAPL", previous);
        });
        TrackedStock entry = tracked.findByTicker("AAPL").orElseThrow();
        assertEquals(newer, entry.getLastSuccessfulFetch());
        assertEquals(newer, entry.getLastFetchAttempt());
        assertEquals(1, entry.getHolderCount());
    }
    @Test
    void realAdapterAndSchedulerPersistValidSymbolsAlongsideMalformedInput() {
        track("AAPL");
        track("BAD/TICKER");
        track("MSFT");
        TiingoClient adapter = new TiingoClient();
        ReflectionTestUtils.setField(adapter, "apiToken", "test-token");
        MockRestServiceServer server = MockRestServiceServer.bindTo((RestTemplate)
                ReflectionTestUtils.getField(adapter, "batchRestTemplate")).build();
        server.expect(request -> {
            assertFalse(TransactionSynchronizationManager.isActualTransactionActive());
            String symbols = request.getURI().getPath().substring("/iex/".length());
            assertEquals(Set.of("AAPL", "MSFT"), Set.of(symbols.split(",")));
        }).andRespond(withSuccess("["
                + "{\"ticker\":\"MSFT\",\"timestamp\":\"2026-09-09T14:00:02Z\",\"tngoLast\":200,\"open\":195,\"prevClose\":190,\"high\":201,\"low\":194},"
                + "{\"ticker\":\"AAPL\",\"timestamp\":\"2026-09-09T14:00:01Z\",\"tngoLast\":100,\"open\":95,\"prevClose\":90,\"high\":101,\"low\":94}"
                + "]", MediaType.APPLICATION_JSON));
        MarketScheduleService market = mock(MarketScheduleService.class);
        when(market.isTradingDayToday()).thenReturn(true);
        AtomicInteger events = new AtomicInteger();
        var scheduler = new ScheduledStockService(stockService, tracked, event -> {
            assertFalse(TransactionSynchronizationManager.isActualTransactionActive());
            assertEquals(2, stocks.count());
            assertEquals(100, stocks.findFirstByTickerOrderByTimestampDesc("AAPL").orElseThrow().getCurrentPrice());
            assertEquals(200, stocks.findFirstByTickerOrderByTimestampDesc("MSFT").orElseThrow().getCurrentPrice());
            TrackedStock invalid = tracked.findByTicker("BAD/TICKER").orElseThrow();
            assertEquals(previous, invalid.getLastSuccessfulFetch());
            assertNotNull(invalid.getLastFetchAttempt());
            events.incrementAndGet();
        }, market, adapter, transactionManager, 100);
        scheduler.fetchIntradayStocks();
        assertEquals(1, events.get());
        server.verify();
    }

}
