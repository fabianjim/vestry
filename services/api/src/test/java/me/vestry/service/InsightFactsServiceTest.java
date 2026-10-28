package me.vestry.service;

import me.vestry.api.HindsightClient.EntryOutcome;
import me.vestry.api.HindsightClient.HoldingPeriod;
import me.vestry.api.HindsightClient.LedgerTrade;
import me.vestry.api.HindsightClient.PatternReportRequest;
import me.vestry.model.JournalEntry;
import me.vestry.model.JournalEntryType;
import me.vestry.model.Stock;
import me.vestry.model.Transaction;
import me.vestry.model.Transaction.TransactionType;
import me.vestry.model.User;
import me.vestry.repository.JournalEntryRepository;
import me.vestry.repository.TransactionRepository;
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
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class InsightFactsServiceTest {
    @Mock TransactionRepository transactions;
    @Mock JournalEntryRepository entries;
    @Mock StockService stocks;
    InsightFactsService service;

    // 22:00 on oct 26 in new york
    private static final Clock LATE = Clock.fixed(Instant.parse("2026-10-27T02:00:00Z"), ZoneOffset.UTC);
    private static final Instant PRICED_AT = Instant.parse("2026-10-26T20:00:00Z");
    private static final LocalDate PRICED_ON = LocalDate.of(2026, 10, 26);

    private final User user = user(4);
    private final List<Transaction> ledger = new ArrayList<>();
    private final List<JournalEntry> journal = new ArrayList<>();

    @BeforeEach
    void setUp() {
        service = new InsightFactsService(transactions, entries, stocks, LATE);
        when(transactions.findByUserIdOrderByTimestampDesc(4)).thenAnswer(inv -> newestFirst(ledger, Transaction::getTimestamp));
        when(entries.findByUserIdOrderByTimestampDesc(4)).thenAnswer(inv -> newestFirst(journal, JournalEntry::getTimestamp));
    }

    @Test
    void partialSellKeepsThePeriodOpenAndAddsItsRealizedGain() {
        trade(1, "NVDA", TransactionType.BUY, 10, 100, "2026-03-02T15:00:00Z");
        trade(2, "NVDA", TransactionType.SELL, 4, 150, "2026-04-01T15:00:00Z");
        entry(7, "NVDA", "2026-03-10T15:00:00Z", 101.0);
        price("NVDA", 120);

        var facts = service.build(user);

        // 4 × (150 − 100) realized, plus 6 × (120 − 100) unrealized
        assertEquals(List.of(new HoldingPeriod("NVDA", at("2026-03-02T15:00:00Z"), null, 320.0)), facts.holdingPeriods());
        assertEquals(List.of(new EntryOutcome(7, 120, "LATEST", PRICED_ON)), facts.outcomes());
    }

    @Test
    void fullSellClosesThePeriodAtAverageCostAndItsEntriesAreSold() {
        trade(1, "NVDA", TransactionType.BUY, 10, 100, "2026-03-02T15:00:00Z");
        trade(2, "NVDA", TransactionType.BUY, 10, 120, "2026-03-05T15:00:00Z");
        trade(3, "NVDA", TransactionType.SELL, 20, 130, "2026-05-01T15:00:00Z");
        entry(7, "NVDA", "2026-03-10T15:00:00Z", 118.0);

        var facts = service.build(user);

        // 20 × (130 − 110)
        assertEquals(List.of(new HoldingPeriod("NVDA", at("2026-03-02T15:00:00Z"), at("2026-05-01T15:00:00Z"), 400.0)),
                facts.holdingPeriods());
        assertEquals(List.of(new EntryOutcome(7, 130, "SOLD", LocalDate.of(2026, 5, 1))), facts.outcomes());
        verifyNoInteractions(stocks);
    }

    @Test
    void rebuyOpensASecondPeriodAndEachEntryKeepsItsOwn() {
        trade(1, "NVDA", TransactionType.BUY, 5, 100, "2026-03-02T15:00:00Z");
        trade(2, "NVDA", TransactionType.SELL, 5, 90, "2026-03-20T15:00:00Z");
        trade(3, "NVDA", TransactionType.BUY, 2, 95, "2026-06-01T15:00:00Z");
        entry(7, "NVDA", "2026-03-10T15:00:00Z", 98.0);
        entry(8, "NVDA", "2026-04-15T15:00:00Z", 92.0);
        entry(9, "NVDA", "2026-06-15T15:00:00Z", 97.0);
        price("NVDA", 100);

        var facts = service.build(user);

        assertEquals(List.of(
                new HoldingPeriod("NVDA", at("2026-03-02T15:00:00Z"), at("2026-03-20T15:00:00Z"), -50.0),
                new HoldingPeriod("NVDA", at("2026-06-01T15:00:00Z"), null, 10.0)), facts.holdingPeriods());
        // 8 was written between the periods, while nothing was held
        assertEquals(List.of(
                new EntryOutcome(9, 100, "LATEST", PRICED_ON),
                new EntryOutcome(8, 100, "LATEST", PRICED_ON),
                new EntryOutcome(7, 90, "SOLD", LocalDate.of(2026, 3, 20))), facts.outcomes());
    }

    @Test
    void notesWrittenOnTheNewYorkDayAPeriodOpensOrClosesBelongToIt() {
        trade(1, "NVDA", TransactionType.BUY, 5, 100, "2026-03-02T15:00:00Z");
        trade(2, "NVDA", TransactionType.SELL, 5, 110, "2026-03-20T15:00:00Z");
        entry(7, "NVDA", "2026-03-02T14:55:00Z", 99.0);
        // 22:00 on mar 20 in new york, though already mar 21 in utc
        entry(8, "NVDA", "2026-03-21T02:00:00Z", 110.0);
        entry(9, "NVDA", "2026-03-21T15:00:00Z", 111.0);
        price("NVDA", 100);

        var outcomes = service.build(user).outcomes();

        assertEquals(List.of(
                new EntryOutcome(9, 100, "LATEST", PRICED_ON),
                new EntryOutcome(8, 110, "SOLD", LocalDate.of(2026, 3, 20)),
                new EntryOutcome(7, 110, "SOLD", LocalDate.of(2026, 3, 20))), outcomes);
    }

    @Test
    void missingPriceLeavesOpenPnlUnknownAndSkipsOutcomes() {
        trade(1, "NVDA", TransactionType.BUY, 3, 100, "2026-03-02T15:00:00Z");
        entry(7, "NVDA", "2026-03-10T15:00:00Z", 101.0);
        // never held, and no price either
        entry(8, "AMD", "2026-03-11T15:00:00Z", 80.0);
        // a snapshot of 0 means no price was known when it was written
        entry(9, "NVDA", "2026-03-12T15:00:00Z", 0.0);
        entry(10, null, "2026-03-13T15:00:00Z", null);
        price("NVDA", 0);
        when(stocks.getLatestStockData("AMD")).thenReturn(Optional.empty());

        var facts = service.build(user);

        assertEquals(List.of(new HoldingPeriod("NVDA", at("2026-03-02T15:00:00Z"), null, null)), facts.holdingPeriods());
        assertEquals(List.of(), facts.outcomes());
        verify(stocks, times(1)).getLatestStockData("NVDA");
    }

    @Test
    void fractionalSharesCloseWithinEpsilon() {
        trade(1, "NVDA", TransactionType.BUY, 0.1, 100, "2026-03-02T15:00:00Z");
        trade(2, "NVDA", TransactionType.BUY, 0.2, 100, "2026-03-03T15:00:00Z");
        trade(3, "NVDA", TransactionType.SELL, 0.3, 110, "2026-03-04T15:00:00Z");

        var period = service.build(user).holdingPeriods().get(0);

        assertEquals(at("2026-03-04T15:00:00Z"), period.closedAt());
        assertEquals(3.0, period.pnl(), 1e-9);
    }

    @Test
    void leavesOutRowsHindsightWouldRejectButKeepsTheirShares() {
        trade(1, "nvda", TransactionType.BUY, 2, 0, "2026-03-02T15:00:00Z");
        trade(2, "NVDA", TransactionType.BUY, 2, 100, "2026-03-03T15:00:00Z");
        trade(3, "NVDA", TransactionType.SELL, 4, 110, "2026-03-04T15:00:00Z");
        trade(4, "1ABC", TransactionType.BUY, 1, 10, "2026-03-05T15:00:00Z");

        var facts = service.build(user);

        // the free shares still count, so selling all 4 closes the period: 4 × (110 − 50)
        assertEquals(List.of(new HoldingPeriod("NVDA", at("2026-03-02T15:00:00Z"), at("2026-03-04T15:00:00Z"), 240.0)),
                facts.holdingPeriods());
        assertEquals(List.of(2, 3), facts.trades().stream().map(LedgerTrade::tradeId).toList());
        assertEquals(List.of("NVDA", "NVDA"), facts.trades().stream().map(LedgerTrade::ticker).toList());
    }

    @Test
    void capsKeepTheNewestAndTradesGoOutOldestFirst() {
        var start = at("2024-01-01T15:00:00Z");
        int pairs = InsightFactsService.MAX_PERIODS + 2;
        for (int i = 0; i < pairs; i++) {
            ledger.add(transaction(2 * i + 1, "NVDA", TransactionType.BUY, 1, 100, start.plusSeconds(3600L * 2 * i)));
            ledger.add(transaction(2 * i + 2, "NVDA", TransactionType.SELL, 1, 100, start.plusSeconds(3600L * (2 * i + 1))));
        }
        int written = InsightFactsService.MAX_OUTCOMES + 5;
        IntStream.range(0, written).forEach(i -> journal.add(
                journalEntry(1000 + i, "NVDA", start.plusSeconds(3600L * 2 * i), 100.0)));

        var facts = service.build(user);

        assertEquals(InsightFactsService.MAX_TRADES, facts.trades().size());
        assertEquals(2 * pairs - InsightFactsService.MAX_TRADES + 1, facts.trades().get(0).tradeId());
        assertEquals(2 * pairs, facts.trades().get(facts.trades().size() - 1).tradeId());
        assertEquals(InsightFactsService.MAX_PERIODS, facts.holdingPeriods().size());
        assertEquals(start.plusSeconds(3600L * 2 * 2), facts.holdingPeriods().get(0).openedAt());
        assertEquals(InsightFactsService.MAX_OUTCOMES, facts.outcomes().size());
        assertEquals(1000 + written - 1, facts.outcomes().get(0).entryId());
    }

    @Test
    void flagsInitialBuysAndUntouchedGeneratedEntriesAndDatesInNewYork() {
        var created = "2026-03-02T15:00:00Z";
        trade(1, "NVDA", TransactionType.BUY, 5, 100, created);
        trade(2, "AAPL", TransactionType.BUY, 2, 200, created);
        trade(3, "NVDA", TransactionType.BUY, 1, 105, "2026-03-05T15:00:00Z");
        trade(4, "AAPL", TransactionType.SELL, 2, 210, "2026-04-01T15:00:00Z");
        body(entry(10, "NVDA", created, null), JournalEntryType.BUY, JournalEntryService.INITIAL_ENTRY_BODY);
        body(entry(11, "AAPL", created, null), JournalEntryType.BUY, JournalEntryService.INITIAL_ENTRY_BODY);
        body(entry(12, "NVDA", "2026-03-05T14:50:00Z", null), JournalEntryType.BUY, "Adding on the dip");
        body(entry(13, "AAPL", "2026-04-01T15:00:00Z", null), JournalEntryType.SELL,
                JournalEntryService.autoSellBody(2, "AAPL"));
        body(entry(14, "AAPL", "2026-04-01T15:05:00Z", null), JournalEntryType.SELL, "Sold 2.0 AAPL, felt right");
        price("NVDA", 110);

        PatternReportRequest facts = service.build(user);

        assertEquals(LocalDate.of(2026, 10, 26), facts.asOf());
        assertEquals(List.of(true, true, false, false), facts.trades().stream().map(LedgerTrade::initial).toList());
        assertEquals(List.of(13, 10, 11), facts.autoEntryIds());
    }

    private void trade(int id, String ticker, TransactionType type, double shares, double price, String when) {
        ledger.add(transaction(id, ticker, type, shares, price, at(when)));
    }

    private JournalEntry entry(int id, String ticker, String when, Double priceSnapshot) {
        var entry = journalEntry(id, ticker, at(when), priceSnapshot);
        journal.add(entry);
        return entry;
    }

    private void price(String ticker, double price) {
        var stock = new Stock();
        stock.setTicker(ticker);
        stock.setCurrentPrice(price);
        stock.setTimestamp(PRICED_AT);
        when(stocks.getLatestStockData(ticker)).thenReturn(Optional.of(stock));
    }

    private static <T> List<T> newestFirst(List<T> items, java.util.function.Function<T, Instant> timestamp) {
        return items.stream().sorted(Comparator.comparing(timestamp).reversed()).toList();
    }

    private static Transaction transaction(int id, String ticker, TransactionType type, double shares, double price, Instant when) {
        var trade = new Transaction(ticker, shares, price, type);
        trade.setId(id);
        trade.setTimestamp(when);
        return trade;
    }

    private static JournalEntry journalEntry(int id, String ticker, Instant when, Double priceSnapshot) {
        var entry = new JournalEntry();
        entry.setId(id);
        entry.setEntryType(JournalEntryType.INSIGHT);
        entry.setTicker(ticker);
        entry.setTimestamp(when);
        entry.setPriceSnapshot(priceSnapshot);
        entry.setBody("Some reasoning");
        return entry;
    }

    private static void body(JournalEntry entry, JournalEntryType type, String body) {
        entry.setEntryType(type);
        entry.setBody(body);
    }

    private static Instant at(String when) {
        return Instant.parse(when);
    }

    private static User user(int id) {
        var user = new User();
        user.setId(id);
        return user;
    }
}
