package me.vestry.service;

import me.vestry.api.DailyClose;
import me.vestry.api.MarketDataClient;
import me.vestry.exception.PriceFetchException;
import me.vestry.exception.UnknownTickerException;
import me.vestry.model.RunUp;
import me.vestry.repository.JournalEntryRepository;
import me.vestry.repository.RunUpRepository;
import me.vestry.repository.TickerMoment;
import me.vestry.repository.TransactionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RunUpServiceTest {
    private static final LocalDate MAR_3 = LocalDate.of(2026, 3, 3);

    @Mock private MarketDataClient market;
    @Mock private RunUpRepository runUps;
    @Mock private TransactionRepository transactions;
    @Mock private JournalEntryRepository entries;
    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-28T14:00:00Z"));
    private final Map<RunUp.Key, RunUp> table = new HashMap<>();

    @BeforeEach
    void storeInMemory() {
        lenient().when(runUps.findAllById(any())).thenAnswer(call -> {
            List<RunUp> found = new ArrayList<>();
            ((Iterable<?>) call.getArgument(0)).forEach(key -> Optional.ofNullable(table.get(key)).ifPresent(found::add));
            return found;
        });
        lenient().when(runUps.findById(any())).thenAnswer(call -> Optional.ofNullable(table.get(call.getArgument(0))));
        lenient().when(runUps.findAll()).thenAnswer(call -> List.copyOf(table.values()));
        lenient().when(runUps.save(any())).thenAnswer(call -> {
            RunUp runUp = call.getArgument(0);
            table.put(runUp.getKey(), runUp);
            return runUp;
        });
    }

    private RunUpService service(int hourly, int daily) {
        return new RunUpService(market, runUps, transactions, entries, clock, hourly, daily);
    }

    /** Weekday closes from Jan 20 up to and including the given last day, rising by 1 each day from 100. */
    private static List<DailyClose> closesThrough(LocalDate last) {
        List<DailyClose> closes = new ArrayList<>();
        double price = 100;
        for (var day = LocalDate.of(2026, 1, 20); !day.isAfter(last); day = day.plusDays(1)) {
            if (day.getDayOfWeek().getValue() <= 5) closes.add(new DailyClose(day, price++));
        }
        return closes;
    }

    private static RunUp.Key key(String ticker, LocalDate day) {
        return new RunUp.Key(ticker, day);
    }

    @Test
    void runUpSpansTheTwentyTradingDaysBeforeTheBuyDay() {
        var closes = new ArrayList<>(closesThrough(MAR_3.minusDays(1)));
        // the buy day's own close comes after the buy, so it never counts
        closes.add(new DailyClose(MAR_3, 10_000));
        var last = closes.get(closes.size() - 2);
        var start = closes.get(closes.size() - 2 - 20);

        assertEquals(last.adjClose() / start.adjClose() - 1, RunUpService.runUp(closes, key("NVDA", MAR_3)), 1e-12);
    }

    @Test
    void runUpNeedsTwentyOneClosesBeforeTheBuyDay() {
        var closes = closesThrough(MAR_3.minusDays(1));
        var twentyOne = closes.subList(closes.size() - 21, closes.size());

        assertNotNull(RunUpService.runUp(twentyOne, key("NVDA", MAR_3)));
        assertNull(RunUpService.runUp(twentyOne.subList(1, 21), key("NVDA", MAR_3)));
        assertNull(RunUpService.runUp(List.of(), key("NVDA", MAR_3)));
    }

    @Test
    void fetchesEachUnfetchedKeyOnceOverThirtyFiveDaysAndStoresIt() {
        var stored = RunUp.known(key("AAPL", MAR_3), 0.05, clock.instant());
        table.put(stored.getKey(), stored);
        when(market.getDailyCloses("NVDA", MAR_3.minusDays(35), MAR_3)).thenReturn(closesThrough(MAR_3));

        var results = service(30, 300).forBuys(List.of(key("NVDA", MAR_3), key("AAPL", MAR_3), key("NVDA", MAR_3)));

        verify(market, times(1)).getDailyCloses(any(), any(), any());
        assertEquals(RunUp.Status.KNOWN, results.get(key("NVDA", MAR_3)).status());
        assertNotNull(results.get(key("NVDA", MAR_3)).runUp());
        assertEquals(new RunUpService.Result(RunUp.Status.KNOWN, 0.05), results.get(key("AAPL", MAR_3)));
        assertEquals(RunUp.Status.KNOWN, table.get(key("NVDA", MAR_3)).getStatus());
    }

    @Test
    void anUnknownTickerOrTooLittleHistoryIsUnavailableForGood() {
        when(market.getDailyCloses(eq("GONE"), any(), any())).thenThrow(new UnknownTickerException("GONE"));
        when(market.getDailyCloses(eq("NEW"), any(), any())).thenReturn(closesThrough(LocalDate.of(2026, 1, 30)));
        var newKey = key("NEW", LocalDate.of(2026, 2, 2));

        var results = service(30, 300).forBuys(List.of(key("GONE", MAR_3), newKey));

        assertEquals(new RunUpService.Result(RunUp.Status.UNAVAILABLE, null), results.get(key("GONE", MAR_3)));
        assertEquals(RunUp.Status.UNAVAILABLE, results.get(newKey).status());
        assertEquals(2, table.size());
        service(30, 300).forBuys(List.of(key("GONE", MAR_3), newKey));
        verify(market, times(2)).getDailyCloses(any(), any(), any());
    }

    @Test
    void anUnreadableResponseStaysPendingAndTheNextKeyIsStillFetched() {
        when(market.getDailyCloses(eq("ODD"), any(), any())).thenThrow(new PriceFetchException("ODD", "Expected a daily prices array"));
        when(market.getDailyCloses(eq("NVDA"), any(), any())).thenReturn(closesThrough(MAR_3));

        var results = service(30, 300).forBuys(List.of(key("ODD", MAR_3), key("NVDA", MAR_3)));

        assertEquals(RunUp.Status.PENDING, results.get(key("ODD", MAR_3)).status());
        assertEquals(RunUp.Status.KNOWN, results.get(key("NVDA", MAR_3)).status());
        assertFalse(table.containsKey(key("ODD", MAR_3)));
    }

    @Test
    void beingRateLimitedStopsTheRunAndLeavesTheRestPending() {
        when(market.getDailyCloses(eq("NVDA"), any(), any()))
                .thenThrow(HttpClientErrorException.create(HttpStatus.TOO_MANY_REQUESTS, "", null, null, null));

        var results = service(30, 300).forBuys(List.of(key("NVDA", MAR_3), key("AAPL", MAR_3)));

        verify(market, never()).getDailyCloses(eq("AAPL"), any(), any());
        assertEquals(RunUp.Status.PENDING, results.get(key("NVDA", MAR_3)).status());
        assertEquals(RunUp.Status.PENDING, results.get(key("AAPL", MAR_3)).status());
        assertTrue(table.isEmpty());
    }

    @Test
    void theThrottleCapsRequestsPerHourAndPerDayAcrossCalls() {
        when(market.getDailyCloses(any(), any(), any())).thenReturn(closesThrough(MAR_3));
        var service = service(2, 3);

        var first = service.forBuys(List.of(key("A", MAR_3), key("B", MAR_3), key("C", MAR_3)));
        assertEquals(RunUp.Status.PENDING, first.get(key("C", MAR_3)).status());
        verify(market, times(2)).getDailyCloses(any(), any(), any());

        clock.advance(Duration.ofMinutes(59));
        service.forBuys(List.of(key("C", MAR_3)));
        verify(market, times(2)).getDailyCloses(any(), any(), any());

        clock.advance(Duration.ofMinutes(2));
        service.forBuys(List.of(key("C", MAR_3), key("D", MAR_3)));
        // the daily limit of 3 holds D back even though the hour has room
        verify(market, times(3)).getDailyCloses(any(), any(), any());
        assertFalse(table.containsKey(key("D", MAR_3)));

        clock.advance(Duration.ofDays(1));
        service.forBuys(List.of(key("D", MAR_3)));
        assertTrue(table.containsKey(key("D", MAR_3)));
    }

    @Test
    void theDrainSkipsInitialAndFetchedBuysAndTakesTheNewestFirst() {
        var created = Instant.parse("2026-01-05T15:00:00Z");
        var fetched = RunUp.unavailable(RunUp.Key.of("MSFT", Instant.parse("2026-02-10T15:00:00Z")), clock.instant());
        table.put(fetched.getKey(), fetched);
        when(entries.findBuyEntriesWithBody(JournalEntryService.INITIAL_ENTRY_BODY))
                .thenReturn(List.of(moment(1, "AAPL", created)));
        when(transactions.findAllBuys()).thenReturn(List.of(
                moment(1, "AAPL", created),                                   // portfolio creation
                moment(2, "AAPL", created),                                   // another user's real buy that instant
                moment(1, "MSFT", Instant.parse("2026-02-10T15:00:00Z")),     // already fetched
                moment(1, "nvda", Instant.parse("2026-03-03T15:00:00Z")),
                moment(3, "NVDA", Instant.parse("2026-03-03T19:00:00Z")),     // same ticker and day: one request
                moment(1, "BAD TICKER", Instant.parse("2026-03-04T15:00:00Z"))));
        List<String> asked = new ArrayList<>();
        doAnswer(call -> { asked.add(call.getArgument(0)); return closesThrough(MAR_3); })
                .when(market).getDailyCloses(any(), any(), any());

        service(30, 300).drain();

        assertEquals(List.of("NVDA", "AAPL"), asked);
        assertTrue(table.containsKey(RunUp.Key.of("AAPL", created)));
    }

    private static TickerMoment moment(int userId, String ticker, Instant timestamp) {
        return new TickerMoment() {
            public int getUserId() { return userId; }
            public String getTicker() { return ticker; }
            public Instant getTimestamp() { return timestamp; }
        };
    }

    private static final class MutableClock extends Clock {
        private Instant now;
        MutableClock(Instant now) { this.now = now; }
        void advance(Duration by) { now = now.plus(by); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }
}
