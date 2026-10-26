package me.vestry.service;

import me.vestry.api.HindsightClient;
import me.vestry.api.HindsightClient.AidResponse;
import me.vestry.api.HindsightClient.AidStatus;
import me.vestry.api.HindsightClient.Since;
import me.vestry.api.HindsightClient.Trade;
import me.vestry.model.JournalEntry;
import me.vestry.model.Stock;
import me.vestry.model.Transaction;
import me.vestry.model.User;
import me.vestry.repository.JournalEntryRepository;
import me.vestry.repository.TransactionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
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
    @InjectMocks ReflectionAidService service;

    private final User user = user(4);
    private final Instant written = Instant.parse("2026-03-03T15:30:00Z");
    private JournalEntry entry;

    @BeforeEach
    void setUp() {
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
        when(transactions.findByUserIdAndTicker(4, "NVDA")).thenReturn(List.of(
                trade(Transaction.TransactionType.BUY, 10, 110, written.minusSeconds(3600)),
                trade(Transaction.TransactionType.SELL, 4, 150, Instant.parse("2026-06-02T03:30:00Z")),
                trade(Transaction.TransactionType.BUY, 5, 131.2, Instant.parse("2026-03-04T15:00:00Z"))));
        var stock = new Stock();
        stock.setCurrentPrice(142.3);
        when(stocks.getLatestStockData("NVDA")).thenReturn(Optional.of(stock));

        var since = service.since(user, entry);

        assertEquals(142.3, since.priceNow());
        assertEquals(11, since.sharesNow());
        // only trades after the entry, oldest first, dated in new york time
        assertEquals(List.of(
                new Trade(LocalDate.of(2026, 3, 4), "BUY", 5, 131.2),
                new Trade(LocalDate.of(2026, 6, 1), "SELL", 4, 150)), since.trades());
    }

    @Test
    void missingOrZeroPriceIsUnknownAndOversoldLedgerIsZero() {
        when(transactions.findByUserIdAndTicker(4, "NVDA")).thenReturn(List.of(
                trade(Transaction.TransactionType.SELL, 3, 150, written.plusSeconds(10))));
        var stock = new Stock();
        stock.setCurrentPrice(0);
        when(stocks.getLatestStockData("NVDA")).thenReturn(Optional.of(stock));

        var since = service.since(user, entry);

        assertNull(since.priceNow());
        assertEquals(0, since.sharesNow());
    }

    @Test
    void entryWithoutATickerHasNoPriceFacts() {
        assertEquals(new Since(null, null, List.of()), service.since(user, entry(7, user, " ", written)));
        verifyNoInteractions(transactions, stocks);
    }

    @Test
    void anotherUsersEntryIsNotFoundAndNeverReachesHindsight() {
        when(entries.findById(7)).thenReturn(Optional.of(entry(7, user(99), "NVDA", written)));

        var reflection = service.reflect(user, 7);

        assertEquals(AidStatus.NOT_FOUND, reflection.response().status());
        verifyNoInteractions(hindsight);
    }

    @Test
    void reflectPassesTheUserEntryIdsAndFactsAndReturnsTheFacts() {
        when(entries.findById(7)).thenReturn(Optional.of(entry));
        when(entries.findByUserIdAndTicker(4, "NVDA")).thenReturn(List.of(entry(8, user, "NVDA", written.plusSeconds(5))));
        when(stocks.getLatestStockData("NVDA")).thenReturn(Optional.empty());
        var ready = new AidResponse(AidStatus.READY, null);
        when(hindsight.reflectionAid(eq(4), eq(7), eq(List.of(8)), any())).thenReturn(ready);

        var reflection = service.reflect(user, 7);

        assertSame(ready, reflection.response());
        assertEquals(new Since(null, 0.0, List.of()), reflection.since());
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
        return entry;
    }

    private static Transaction trade(Transaction.TransactionType type, double shares, double price, Instant when) {
        var trade = new Transaction("NVDA", shares, price, type);
        trade.setTimestamp(when);
        return trade;
    }
}
