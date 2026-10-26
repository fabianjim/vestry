package me.vestry.service;

import me.vestry.api.HindsightClient;
import me.vestry.api.HindsightClient.AidResponse;
import me.vestry.api.HindsightClient.AidResult;
import me.vestry.api.HindsightClient.AidStatus;
import me.vestry.api.HindsightClient.Citation;
import me.vestry.api.HindsightClient.Claim;
import me.vestry.api.HindsightClient.ReflectionAid;
import me.vestry.api.HindsightClient.SavedAid;
import me.vestry.api.HindsightClient.Since;
import me.vestry.api.HindsightClient.Trade;
import me.vestry.model.DemoSession;
import me.vestry.model.JournalEntry;
import me.vestry.model.Stock;
import me.vestry.model.Transaction;
import me.vestry.model.User;
import me.vestry.repository.JournalEntryRepository;
import me.vestry.repository.TransactionRepository;
import me.vestry.service.ReflectionAidService.Status;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReflectionAidServiceTest {
    @Mock HindsightClient hindsight;
    @Mock JournalEntryRepository entries;
    @Mock TransactionRepository transactions;
    @Mock StockService stocks;
    ReflectionAidService service;

    // 03:30 in new york on oct 25
    private static final Clock NIGHT = Clock.fixed(Instant.parse("2026-10-25T07:30:00Z"), ZoneOffset.UTC);
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 25);
    private static final ReflectionAid AID = new ReflectionAid(
            List.of(new Claim("You later called the dip overdone", List.of(new Citation(52, "overdone")))),
            List.of("What made this look like a dip?"));

    private final User user = user(4);
    private final Instant written = Instant.parse("2026-03-03T15:30:00Z");
    private JournalEntry entry;

    @BeforeEach
    void setUp() {
        service = new ReflectionAidService(hindsight, entries, transactions, stocks, NIGHT);
        entry = entry(7, user, "NVDA", written);
    }

    @Test
    void sendsLaterSameTickerEntriesAndReflectionsNewestFirst() {
        var reflection = entry(9, user, null, written.plusSeconds(100));
        when(entries.findByUserIdAndTicker(4, "NVDA")).thenReturn(List.of(
                entry, entry(5, user, "NVDA", written.minusSeconds(60)),
                entry(8, user, "NVDA", written.plusSeconds(50)), entry(10, user, "NVDA", written.plusSeconds(200))));
        when(entries.findByUserIdAndSourceEntryId(4, 7)).thenReturn(List.of(reflection));

        // 5 predates the entry; 7 is the entry itself
        assertEquals(List.of(10, 9, 8), service.laterEntryIds(user, entry));
    }

    @Test
    void entryWithoutATickerStillSendsItsReflections() {
        var note = entry(7, user, null, written);
        when(entries.findByUserIdAndSourceEntryId(4, 7)).thenReturn(List.of(entry(9, user, null, written.plusSeconds(10))));

        assertEquals(List.of(9), service.laterEntryIds(user, note));
        verify(entries, never()).findByUserIdAndTicker(anyInt(), any());
    }

    @Test
    void capsLaterEntriesAtTheContractLimit() {
        when(entries.findByUserIdAndTicker(4, "NVDA")).thenReturn(IntStream.range(100, 100 + ReflectionAidService.MAX_LATER_ENTRIES + 5)
                .mapToObj(id -> entry(id, user, "NVDA", written.plusSeconds(id))).toList());

        var ids = service.laterEntryIds(user, entry);

        assertEquals(ReflectionAidService.MAX_LATER_ENTRIES, ids.size());
        assertEquals(100 + ReflectionAidService.MAX_LATER_ENTRIES + 4, ids.get(0));
    }

    @Test
    void factsComeFromTheLedgerAndTheLatestPrice() {
        var ledger = List.of(
                trade(Transaction.TransactionType.BUY, 10, 110, written.minusSeconds(3600)),
                trade(Transaction.TransactionType.SELL, 4, 150, Instant.parse("2026-06-02T03:30:00Z")),
                trade(Transaction.TransactionType.BUY, 5, 131.2, Instant.parse("2026-03-04T15:00:00Z")));
        when(stocks.getLatestStockData("NVDA")).thenReturn(Optional.of(stock(142.3)));

        var since = service.since(entry, ledger);

        assertEquals(142.3, since.priceNow());
        assertEquals(11, since.sharesNow());
        // only trades after the entry, oldest first, dated in new york time
        assertEquals(List.of(
                new Trade(LocalDate.of(2026, 3, 4), "BUY", 5, 131.2),
                new Trade(LocalDate.of(2026, 6, 1), "SELL", 4, 150)), since.trades());
    }

    @Test
    void missingOrZeroPriceIsUnknownAndOversoldLedgerIsZero() {
        when(stocks.getLatestStockData("NVDA")).thenReturn(Optional.of(stock(0)));

        var since = service.since(entry, List.of(trade(Transaction.TransactionType.SELL, 3, 150, written.plusSeconds(10))));

        assertNull(since.priceNow());
        assertEquals(0, since.sharesNow());
    }

    @Test
    void entryWithoutATickerHasNoPriceFacts() {
        assertEquals(new Since(null, null, List.of()), service.since(entry(7, user, " ", written), List.of()));
        verifyNoInteractions(stocks);
    }

    @Test
    void anotherUsersEntryIsNotFoundAndNeverReachesHindsight() {
        when(entries.findById(7)).thenReturn(Optional.of(entry(7, user(99), "NVDA", written)));

        assertEquals(Status.NOT_FOUND, service.reflect(user, 7).status());
        verifyNoInteractions(hindsight);
    }

    @Test
    void reflectPassesTheUserEntryIdsAndFactsAndReturnsTheAid() {
        when(entries.findById(7)).thenReturn(Optional.of(entry));
        when(entries.findByUserIdAndTicker(4, "NVDA")).thenReturn(List.of(entry(8, user, "NVDA", written.plusSeconds(5))));
        when(stocks.getLatestStockData("NVDA")).thenReturn(Optional.empty());
        when(hindsight.reflectionAid(eq(4), eq(7), eq(List.of(8)), any()))
                .thenReturn(new AidResponse(AidStatus.READY, new AidResult(AID, TODAY, 9)));

        var reflection = service.reflect(user, 7);

        assertEquals(Status.READY, reflection.status());
        assertEquals(AID, reflection.aid());
        assertEquals(9, reflection.remainingToday());
        assertEquals(new Since(null, 0.0, List.of()), reflection.since());
    }

    @Test
    void hindsightOutcomesCarryThrough() {
        when(entries.findById(7)).thenReturn(Optional.of(entry));
        when(hindsight.reflectionAid(anyInt(), anyInt(), any(), any())).thenReturn(AidResponse.of(AidStatus.LIMITED));

        assertEquals(Status.LIMITED, service.reflect(user, 7).status());
    }

    @Test
    void demoReadsTheTemplatesSavedAidAndNeverGenerates() {
        var template = user(5);
        var session = demoSession(Map.of(-1, 7, -2, 52));
        session.getTransactions().add(trade(Transaction.TransactionType.BUY, 2, 120, written.plusSeconds(60)));
        when(stocks.getLatestStockData("NVDA")).thenReturn(Optional.of(stock(142.3)));
        when(hindsight.savedReflectionAids(5, List.of(7))).thenReturn(Map.of(7, new SavedAid(7, AID, TODAY.minusDays(2))));

        var reflection = service.reflectDemo(session, template, -1);

        assertEquals(Status.READY, reflection.status());
        assertNull(reflection.remainingToday());
        assertEquals(TODAY.minusDays(2), reflection.generatedOn());
        // the quote now points at the visitor's copy of entry 52
        assertEquals(-2, reflection.aid().recap().get(0).citations().get(0).entryId());
        // numbers come from the visitor's session, including their own trade
        assertEquals(2, reflection.since().sharesNow());
        verify(hindsight, never()).reflectionAid(anyInt(), anyInt(), any(), any());
    }

    @Test
    void demoVisitorsOwnEntryAndUnreadyEntriesSayWhy() {
        var template = user(5);
        var session = demoSession(Map.of(-1, 7));
        session.getJournalEntries().add(entry(-9, template, null, written));

        assertEquals(Status.DEMO_OWN_ENTRY, service.reflectDemo(session, template, -9).status());
        assertEquals(Status.NOT_READY, service.reflectDemo(session, template, -1).status());
        assertEquals(Status.NOT_FOUND, service.reflectDemo(session, template, -404).status());
        verify(hindsight, never()).reflectionAid(anyInt(), anyInt(), any(), any());
    }

    @Test
    void demoRefreshDoesMissingFirstThenOldestAndSkipsTodays() {
        var template = user(5);
        var sample = List.of(entry(1, template, "NVDA", written), entry(2, template, "NVDA", written),
                entry(3, template, "NVDA", written), entry(4, template, "NVDA", written), body(entry(5, template, "NVDA", written), " "));
        when(entries.findByUserIdOrderByTimestampDesc(5)).thenReturn(sample);
        when(hindsight.savedReflectionAids(5, List.of(1, 2, 3, 4))).thenReturn(Map.of(
                1, new SavedAid(1, AID, TODAY.minusDays(1)),
                2, new SavedAid(2, AID, TODAY.minusDays(4)),
                3, new SavedAid(3, AID, TODAY)));
        var order = new ArrayList<Integer>();
        sample.forEach(e -> lenient().when(entries.findById(e.getId())).thenReturn(Optional.of(e)));
        when(hindsight.reflectionAid(eq(5), anyInt(), any(), any())).thenAnswer(call -> {
            order.add(call.getArgument(1));
            return new AidResponse(AidStatus.READY, new AidResult(AID, TODAY, 9));
        });

        assertEquals(3, service.refreshDemo(template));
        // 4 has none, then 2 is oldest, then 1; 3 is already today's and 5 has no text
        assertEquals(List.of(4, 2, 1), order);
    }

    @Test
    void demoRefreshStopsAtTheDailyLimitOrAnOutage() {
        var template = user(5);
        var sample = List.of(entry(1, template, "NVDA", written), entry(2, template, "NVDA", written));
        when(entries.findByUserIdOrderByTimestampDesc(5)).thenReturn(sample);
        sample.forEach(e -> lenient().when(entries.findById(e.getId())).thenReturn(Optional.of(e)));
        when(hindsight.reflectionAid(eq(5), anyInt(), any(), any())).thenReturn(AidResponse.of(AidStatus.LIMITED));

        assertEquals(0, service.refreshDemo(template));
        verify(hindsight, times(1)).reflectionAid(anyInt(), anyInt(), any(), any());
    }

    private DemoSession demoSession(Map<Integer, Integer> templateIds) {
        var session = new DemoSession();
        var template = user(5);
        session.getJournalEntries().add(entry(-1, template, "NVDA", written));
        session.getJournalEntries().add(entry(-2, template, "NVDA", written.plusSeconds(30)));
        session.setTemplateEntryIds(new HashMap<>(templateIds));
        return session;
    }

    private static User user(int id) {
        var user = new User();
        user.setId(id);
        return user;
    }

    private static JournalEntry entry(int id, User owner, String ticker, Instant when) {
        var entry = new JournalEntry();
        entry.setId(id);
        entry.setUser(owner);
        entry.setTicker(ticker);
        entry.setTimestamp(when);
        entry.setBody("Some reasoning");
        return entry;
    }

    private static JournalEntry body(JournalEntry entry, String body) {
        entry.setBody(body);
        return entry;
    }

    private static Stock stock(double price) {
        var stock = new Stock();
        stock.setCurrentPrice(price);
        return stock;
    }

    private static Transaction trade(Transaction.TransactionType type, double shares, double price, Instant when) {
        var trade = new Transaction("NVDA", shares, price, type);
        trade.setTimestamp(when);
        return trade;
    }
}
