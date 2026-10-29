package me.vestry.service;

import me.vestry.api.HindsightClient.BehaviorNote;
import me.vestry.api.HindsightClient.BehaviorReportRequest;
import me.vestry.api.HindsightClient.Feedback;
import me.vestry.api.HindsightClient.HoldingPeriod;
import me.vestry.api.HindsightClient.LedgerTrade;
import me.vestry.api.HindsightClient.Position;
import me.vestry.model.BehaviorFeedback;
import me.vestry.model.BehaviorKey;
import me.vestry.model.JournalEntry;
import me.vestry.model.JournalEntryType;
import me.vestry.model.RunUp;
import me.vestry.model.Stock;
import me.vestry.model.StockMetadata;
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
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class InsightFactsServiceTest {
    @Mock TransactionRepository transactions;
    @Mock JournalEntryRepository entries;
    @Mock StockService stocks;
    @Mock NasdaqMetadataService metadata;
    @Mock RunUpService runUps;
    @Mock InsightFeedbackService feedback;
    InsightFactsService service;

    // 22:00 on oct 26 in new york
    private static final Clock LATE = Clock.fixed(Instant.parse("2026-10-27T02:00:00Z"), ZoneOffset.UTC);
    // 20:30 on oct 26 in new york, though already oct 27 in utc
    private static final Instant PRICED_AT = Instant.parse("2026-10-27T00:30:00Z");
    private static final LocalDate PRICED_ON = LocalDate.of(2026, 10, 26);

    private final User user = user(4);
    private final List<Transaction> ledger = new ArrayList<>();
    private final List<JournalEntry> journal = new ArrayList<>();

    @BeforeEach
    void setUp() {
        // unstubbed mocks answer empty: no run-ups, metadata, prices, EOD rows, feedback or notes
        service = new InsightFactsService(transactions, entries, stocks, metadata, runUps, feedback, LATE);
        lenient().when(transactions.findByUserIdOrderByTimestampDesc(4)).thenAnswer(inv -> newestFirst(ledger, Transaction::getTimestamp));
        lenient().when(entries.findByUserIdOrderByTimestampDesc(4)).thenAnswer(inv -> newestFirst(journal, JournalEntry::getTimestamp));
    }

    @Test
    void theSaleThatClosesAPeriodIsEveryBuysOutcome() {
        trade(1, "NVDA", TransactionType.BUY, 10, 100, "2026-03-02T15:00:00Z");
        trade(2, "NVDA", TransactionType.BUY, 10, 120, "2026-03-05T15:00:00Z");
        trade(3, "NVDA", TransactionType.SELL, 5, 150, "2026-04-01T15:00:00Z");
        // 21:00 on may 1 in new york, though already may 2 in utc
        trade(4, "NVDA", TransactionType.SELL, 15, 130, "2026-05-02T01:00:00Z");

        var facts = service.build(user);

        var sold = Arrays.<Object>asList(130.0, "SOLD", LocalDate.of(2026, 5, 1));
        assertEquals(sold, outcome(sent(facts, 1)));
        assertEquals(sold, outcome(sent(facts, 2)));
        // the cost is everything bought; at 110 average cost, 5 × 40 + 15 × 20 realized
        assertEquals(List.of(new HoldingPeriod("NVDA", at("2026-03-02T15:00:00Z"), at("2026-05-02T01:00:00Z"), 2200, 500.0)),
                facts.holdingPeriods());
        // a closed position is not a holding and needs no price
        assertNull(facts.portfolioValue());
        assertEquals(List.of(), facts.holdings());
        verifyNoInteractions(stocks);
    }

    @Test
    void rebuyOpensANewPeriodValuedAtTheLatestPrice() {
        trade(1, "NVDA", TransactionType.BUY, 5, 100, "2026-03-02T15:00:00Z");
        trade(2, "NVDA", TransactionType.SELL, 5, 90, "2026-03-20T15:00:00Z");
        trade(3, "NVDA", TransactionType.BUY, 2, 95, "2026-06-01T15:00:00Z");
        trade(4, "NVDA", TransactionType.BUY, 2, 105, "2026-06-05T15:00:00Z");
        trade(5, "NVDA", TransactionType.SELL, 1, 120, "2026-07-01T15:00:00Z");
        price("NVDA", 110);

        var facts = service.build(user);

        assertEquals(Arrays.<Object>asList(90.0, "SOLD", LocalDate.of(2026, 3, 20)), outcome(sent(facts, 1)));
        assertEquals(Arrays.<Object>asList(110.0, "LATEST", PRICED_ON), outcome(sent(facts, 3)));
        assertEquals(Arrays.<Object>asList(110.0, "LATEST", PRICED_ON), outcome(sent(facts, 4)));
        // the open period keeps its full buy cost; 1 × (120 − 100) realized plus 3 × (110 − 100) unrealized
        assertEquals(List.of(
                new HoldingPeriod("NVDA", at("2026-03-02T15:00:00Z"), at("2026-03-20T15:00:00Z"), 500, -50.0),
                new HoldingPeriod("NVDA", at("2026-06-01T15:00:00Z"), null, 400, 50.0)), facts.holdingPeriods());
    }

    @Test
    void withoutALatestPriceAnOpenPeriodHasNoOutcomePnlOrHolding() {
        trade(1, "NVDA", TransactionType.BUY, 3, 100, "2026-03-02T15:00:00Z");

        var facts = service.build(user);

        assertEquals(Arrays.asList(null, null, null), outcome(sent(facts, 1)));
        assertEquals(List.of(new HoldingPeriod("NVDA", at("2026-03-02T15:00:00Z"), null, 300, null)), facts.holdingPeriods());
        assertNull(facts.portfolioValue());
        assertEquals(List.of(), facts.holdings());
        // looked up once, though three facts need it
        verify(stocks, times(1)).getLatestStockData("NVDA");
    }

    @Test
    void sellsCarryNoBuyFacts() {
        trade(1, "NVDA", TransactionType.BUY, 3, 100, "2026-03-02T15:00:00Z");
        trade(2, "NVDA", TransactionType.SELL, 3, 110, "2026-03-05T15:00:00Z");

        assertEquals(new LedgerTrade(2, "NVDA", "SELL", 3, 110, at("2026-03-05T15:00:00Z"), false,
                null, RunUp.Status.UNAVAILABLE, null, null, null, null), sent(service.build(user), 2));
    }

    @Test
    void weightAtBuyIsTheTradeOverTheOpenCostBasisPlusTheTrade() {
        trade(1, "AAA", TransactionType.BUY, 10, 100, "2026-03-02T15:00:00Z");
        trade(2, "BBB", TransactionType.BUY, 10, 100, "2026-03-03T15:00:00Z");
        // at average cost, AAA's open basis drops to 500 whatever the sale price
        trade(3, "AAA", TransactionType.SELL, 5, 200, "2026-03-04T15:00:00Z");
        trade(4, "CCC", TransactionType.BUY, 5, 100, "2026-03-05T15:00:00Z");

        var weights = service.build(user).trades().stream().map(LedgerTrade::weightAtBuy).toList();

        // 500 / (500 + 1000 + 500)
        assertEquals(Arrays.asList(1.0, 0.5, null, 0.25), weights);
    }

    @Test
    void initialBuysAreFlaggedWithoutARunUpAndGeneratedEntriesAreListed() {
        var created = "2026-03-02T15:00:00Z";
        trade(1, "NVDA", TransactionType.BUY, 5, 100, created);
        trade(2, "AAPL", TransactionType.BUY, 2, 200, created);
        trade(3, "NVDA", TransactionType.BUY, 1, 105, "2026-03-05T15:00:00Z");
        trade(4, "AAPL", TransactionType.SELL, 2, 210, "2026-04-01T15:00:00Z");
        body(entry(10, "NVDA", created), JournalEntryType.BUY, JournalEntryService.INITIAL_ENTRY_BODY);
        body(entry(11, "AAPL", created), JournalEntryType.BUY, JournalEntryService.INITIAL_ENTRY_BODY);
        body(entry(12, "NVDA", "2026-03-05T14:50:00Z"), JournalEntryType.BUY, "Adding on the dip");
        body(entry(13, "AAPL", "2026-04-01T15:00:00Z"), JournalEntryType.SELL, JournalEntryService.autoSellBody(2, "AAPL"));
        body(entry(14, "AAPL", "2026-04-01T15:05:00Z"), JournalEntryType.SELL, "Sold 2.0 AAPL, felt right");

        BehaviorReportRequest facts = service.build(user);

        assertEquals(LocalDate.of(2026, 10, 26), facts.asOf());
        assertEquals(List.of(true, true, false, false), facts.trades().stream().map(LedgerTrade::initial).toList());
        assertNull(sent(facts, 1).runUp());
        assertEquals(RunUp.Status.UNAVAILABLE, sent(facts, 1).runUpStatus());
        verify(runUps).forBuys(List.of(RunUp.Key.of("NVDA", at("2026-03-05T15:00:00Z"))));
        assertEquals(List.of(13, 10, 11), facts.autoEntryIds());
    }

    @Test
    void otherBuysCarryTheirRunUpAndAKnownRunUpNeedsAFigure() {
        trade(1, "NVDA", TransactionType.BUY, 1, 100, "2026-03-05T15:00:00Z");
        trade(2, "AMD", TransactionType.BUY, 1, 100, "2026-03-06T15:00:00Z");
        trade(3, "MSFT", TransactionType.BUY, 1, 100, "2026-03-09T15:00:00Z");
        trade(4, "AAPL", TransactionType.BUY, 1, 100, "2026-03-10T15:00:00Z");
        when(runUps.forBuys(any())).thenReturn(Map.of(
                RunUp.Key.of("NVDA", at("2026-03-05T15:00:00Z")), new RunUpService.Result(RunUp.Status.KNOWN, 0.12),
                RunUp.Key.of("AMD", at("2026-03-06T15:00:00Z")), new RunUpService.Result(RunUp.Status.PENDING, null),
                RunUp.Key.of("MSFT", at("2026-03-09T15:00:00Z")), new RunUpService.Result(RunUp.Status.KNOWN, null)));

        var trades = service.build(user).trades();

        assertEquals(Arrays.asList(0.12, null, null, null), trades.stream().map(LedgerTrade::runUp).toList());
        // AAPL's run-up is missing from the answer
        assertEquals(List.of(RunUp.Status.KNOWN, RunUp.Status.PENDING, RunUp.Status.UNAVAILABLE, RunUp.Status.UNAVAILABLE),
                trades.stream().map(LedgerTrade::runUpStatus).toList());
    }

    @Test
    void holdingsArePricedOpenPositionsLargestFirstWithTheirShareAndSector() {
        trade(1, "AAA", TransactionType.BUY, 10, 40, "2026-03-02T15:00:00Z");
        trade(2, "BBB", TransactionType.BUY, 2, 900, "2026-03-03T15:00:00Z");
        trade(3, "CCC", TransactionType.BUY, 5, 10, "2026-03-04T15:00:00Z");
        trade(4, "DDD", TransactionType.BUY, 5, 10, "2026-03-05T15:00:00Z");
        trade(5, "DDD", TransactionType.SELL, 5, 12, "2026-03-06T15:00:00Z");
        price("AAA", 50);
        price("BBB", 1000);
        // CCC has no price, and DDD is closed
        lenient().when(metadata.lookupMetadata("AAA")).thenReturn(Optional.of(new StockMetadata("AAA", "A Inc", "US", "Technology", "Semis")));

        var facts = service.build(user);

        assertEquals(2500.0, facts.portfolioValue());
        assertEquals(List.of(
                new Position("BBB", 2000, 0.8, null, null),
                new Position("AAA", 500, 0.2, "Technology", null)), facts.holdings());
    }

    @Test
    void dailyVolatilityIsTheSampleStandardDeviationOfAtLeastThirtyReturns() {
        assertNull(InsightFactsService.dailyVolatility(alternating(29)));
        // mean 0, so σ² = 30 × 0.01² / 29
        assertEquals(Math.sqrt(30 * 0.0001 / 29), InsightFactsService.dailyVolatility(alternating(30)), 1e-12);
    }

    @Test
    void possibleMonthlyLossScalesTheHoldingByOneNewYorkDayReturnsVolatility() {
        trade(1, "NVDA", TransactionType.BUY, 10, 100, "2026-03-02T15:00:00Z");
        price("NVDA", 100);
        var rows = new ArrayList<Stock>();
        var expected = new double[30];
        // a second row for sep 1 in new york, stored after midnight utc, replaces the first
        rows.add(eod(at("2026-09-01T20:30:00Z"), 150, 100));
        for (int day = 0; day < 30; day++) {
            double close = day % 2 == 0 ? 102 : 99;
            var when = day == 0 ? at("2026-09-02T01:00:00Z") : at("2026-09-01T20:30:00Z").plusSeconds(86_400L * day);
            rows.add(eod(when, close, 100));
            expected[day] = close / 100 - 1;
        }
        rows.add(eod(at("2026-10-01T20:30:00Z"), 100, 0));
        when(stocks.getEodStockData("NVDA")).thenReturn(rows);

        var loss = service.build(user).holdings().get(0).possibleMonthlyLoss();

        assertEquals(1000 * 1.65 * InsightFactsService.dailyVolatility(expected) * Math.sqrt(21), loss, 1e-9);
    }

    @Test
    void sendsFeedbackAndTheBehaviorsNotesAreAbout() {
        var updated = at("2026-10-20T14:00:00Z");
        when(feedback.list(user)).thenReturn(List.of(new BehaviorFeedback(new BehaviorKey("emotional", "anxious"),
                LocalDate.of(2026, 10, 19), BehaviorFeedback.Reaction.FITS, "Yes, that's me", updated)));
        when(entries.findTop500ByUserIdAndBehaviorKeyIsNotNullOrderByTimestampDescIdDesc(4)).thenReturn(List.of(
                behavior(entry(20, null, "2026-10-21T15:00:00Z"), "fomo"),
                behavior(entry(21, null, "2026-10-20T15:00:00Z"), "Bad Key"),
                behavior(entry(22, null, "2026-10-19T15:00:00Z"), "emotional:anxious")));

        var facts = service.build(user);

        assertEquals(List.of(new Feedback("emotional", "anxious", BehaviorFeedback.Reaction.FITS, "Yes, that's me",
                LocalDate.of(2026, 10, 19), updated)), facts.feedback());
        assertEquals(List.of(new BehaviorNote("fomo", null, 20), new BehaviorNote("emotional", "anxious", 22)),
                facts.behaviorNotes());
    }

    @Test
    void tradesAndPeriodsKeepTheNewest() {
        var start = at("2024-01-01T15:00:00Z");
        int pairs = InsightFactsService.MAX_PERIODS + 2;
        for (int i = 0; i < pairs; i++) {
            ledger.add(transaction(2 * i + 1, "NVDA", TransactionType.BUY, 1, 100, start.plusSeconds(3600L * 2 * i)));
            ledger.add(transaction(2 * i + 2, "NVDA", TransactionType.SELL, 1, 100, start.plusSeconds(3600L * (2 * i + 1))));
        }

        var facts = service.build(user);

        assertEquals(InsightFactsService.MAX_TRADES, facts.trades().size());
        assertEquals(2 * pairs - InsightFactsService.MAX_TRADES + 1, facts.trades().get(0).tradeId());
        assertEquals(2 * pairs, facts.trades().get(facts.trades().size() - 1).tradeId());
        assertEquals(InsightFactsService.MAX_PERIODS, facts.holdingPeriods().size());
        assertEquals(start.plusSeconds(3600L * 2 * 2), facts.holdingPeriods().get(0).openedAt());
    }

    @Test
    void holdingsKeepTheLargestButTheirWeightsCountEveryPosition() {
        int positions = InsightFactsService.MAX_HOLDINGS + 5;
        for (int i = 0; i < positions; i++) {
            ledger.add(transaction(i + 1, "T" + i, TransactionType.BUY, 1, 1, at("2026-03-02T15:00:00Z").plusSeconds(i)));
        }
        // T0 is worth 1, T204 205
        when(stocks.getLatestStockData(anyString())).thenAnswer(inv -> {
            String ticker = inv.getArgument(0);
            return Optional.of(stock(ticker, Integer.parseInt(ticker.substring(1)) + 1));
        });

        var facts = service.build(user);

        double total = positions * (positions + 1) / 2.0;
        assertEquals(total, facts.portfolioValue());
        assertEquals(InsightFactsService.MAX_HOLDINGS, facts.holdings().size());
        assertEquals(new Position("T204", 205, 205 / total, null, null), facts.holdings().get(0));
        assertEquals("T5", facts.holdings().get(facts.holdings().size() - 1).ticker());
    }

    @Test
    void leavesOutRowsHindsightWouldRejectButKeepsTheirSharesAndValue() {
        trade(1, "nvda", TransactionType.BUY, 2, 0, "2026-03-02T15:00:00Z");
        trade(2, "NVDA", TransactionType.BUY, 2, 100, "2026-03-03T15:00:00Z");
        trade(3, "NVDA", TransactionType.SELL, 4, 110, "2026-03-04T15:00:00Z");
        trade(4, "1ABC", TransactionType.BUY, 1, 10, "2026-03-05T15:00:00Z");
        trade(5, "AMD", TransactionType.BUY, 1, 40, "2026-03-06T15:00:00Z");
        price("1ABC", 10);
        price("AMD", 40);

        var facts = service.build(user);

        // the free shares still count, so selling all 4 closes the period: 4 × (110 − 50)
        assertEquals(List.of(
                new HoldingPeriod("NVDA", at("2026-03-02T15:00:00Z"), at("2026-03-04T15:00:00Z"), 200, 240.0),
                new HoldingPeriod("AMD", at("2026-03-06T15:00:00Z"), null, 40, 0.0)), facts.holdingPeriods());
        assertEquals(List.of(2, 3, 5), facts.trades().stream().map(LedgerTrade::tradeId).toList());
        assertEquals(List.of("NVDA", "NVDA", "AMD"), facts.trades().stream().map(LedgerTrade::ticker).toList());
        // 1ABC is still part of the portfolio's value
        assertEquals(50.0, facts.portfolioValue());
        assertEquals(List.of(new Position("AMD", 40, 0.8, null, null)), facts.holdings());
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

    private void trade(int id, String ticker, TransactionType type, double shares, double price, String when) {
        ledger.add(transaction(id, ticker, type, shares, price, at(when)));
    }

    private JournalEntry entry(int id, String ticker, String when) {
        var entry = journalEntry(id, ticker, at(when));
        journal.add(entry);
        return entry;
    }

    private void price(String ticker, double price) {
        // lenient: other tickers' lookups fall through to empty
        lenient().when(stocks.getLatestStockData(ticker)).thenReturn(Optional.of(stock(ticker, price)));
    }

    private static LedgerTrade sent(BehaviorReportRequest facts, int tradeId) {
        return facts.trades().stream().filter(t -> t.tradeId() == tradeId).findFirst().orElseThrow();
    }

    private static List<Object> outcome(LedgerTrade trade) {
        return Arrays.asList(trade.outcomePrice(), trade.outcomeKind(), trade.outcomeOn());
    }

    private static double[] alternating(int count) {
        var returns = new double[count];
        for (int i = 0; i < count; i++) returns[i] = i % 2 == 0 ? 0.01 : -0.01;
        return returns;
    }

    private static Stock stock(String ticker, double price) {
        var stock = new Stock();
        stock.setTicker(ticker);
        stock.setCurrentPrice(price);
        stock.setTimestamp(PRICED_AT);
        return stock;
    }

    private static Stock eod(Instant when, double close, double prevClose) {
        var stock = new Stock();
        stock.setTicker("NVDA");
        stock.setType(Stock.StockType.EOD);
        stock.setCurrentPrice(close);
        stock.setPrevClose(prevClose);
        stock.setTimestamp(when);
        return stock;
    }

    private static <T> List<T> newestFirst(List<T> items, java.util.function.Function<T, Instant> timestamp) {
        return items.stream().sorted(Comparator.comparing(timestamp).reversed()).toList();
    }

    private static Transaction transaction(int id, String ticker, TransactionType type, double shares, double price, Instant when) {
        // the constructor sets totalValue to shares × price
        var trade = new Transaction(ticker, shares, price, type);
        trade.setId(id);
        trade.setTimestamp(when);
        return trade;
    }

    private static JournalEntry journalEntry(int id, String ticker, Instant when) {
        var entry = new JournalEntry();
        entry.setId(id);
        entry.setEntryType(JournalEntryType.INSIGHT);
        entry.setTicker(ticker);
        entry.setTimestamp(when);
        entry.setBody("Some reasoning");
        return entry;
    }

    private static void body(JournalEntry entry, JournalEntryType type, String body) {
        entry.setEntryType(type);
        entry.setBody(body);
    }

    private static JournalEntry behavior(JournalEntry entry, String key) {
        entry.setBehaviorKey(key);
        return entry;
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
