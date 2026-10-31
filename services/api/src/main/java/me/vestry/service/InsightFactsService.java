package me.vestry.service;

import me.vestry.api.HindsightClient.BehaviorNote;
import me.vestry.api.HindsightClient.BehaviorReportRequest;
import me.vestry.api.HindsightClient.Feedback;
import me.vestry.api.HindsightClient.HoldingPeriod;
import me.vestry.api.HindsightClient.LedgerTrade;
import me.vestry.api.HindsightClient.Position;
import me.vestry.model.BehaviorKey;
import me.vestry.model.JournalEntry;
import me.vestry.model.JournalEntryType;
import me.vestry.model.RunUp;
import me.vestry.model.Stock;
import me.vestry.model.StockMetadata;
import me.vestry.model.Transaction;
import me.vestry.model.User;
import me.vestry.repository.JournalEntryRepository;
import me.vestry.repository.TransactionRepository;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Insights: the market and ledger facts hindsight needs to find behaviors. Hindsight trusts these numbers
 * and reads entry text itself, so only IDs and numbers leave here.
 */
@Service
public class InsightFactsService {
    /** Hindsight's contract caps each list. */
    static final int MAX_TRADES = 1000;
    static final int MAX_PERIODS = 1000;
    static final int MAX_HOLDINGS = 200;
    static final int MAX_AUTO_ENTRIES = 1000;
    static final int MAX_FEEDBACK = 200;
    static final int MAX_NOTES = 500;
    /** With fewer daily returns than this, a holding's possible loss is unknown. */
    static final int MIN_RETURNS = 30;
    private static final int MAX_SECTOR = 100;
    private static final double EPSILON = 1e-9;
    /** Hindsight's ticker rule; one row it rejects fails the whole request. */
    private static final Pattern TICKER = Pattern.compile("[A-Z][A-Z0-9.\\-]{0,9}");
    private static final Comparator<Transaction> CHRONOLOGICAL = Comparator.comparing(Transaction::getTimestamp)
            .thenComparingInt(Transaction::getId);

    private final TransactionRepository transactions;
    private final JournalEntryRepository entries;
    private final StockService stocks;
    private final NasdaqMetadataService metadata;
    private final RunUpService runUps;
    private final InsightFeedbackService feedback;
    private final Clock clock;

    public InsightFactsService(TransactionRepository transactions, JournalEntryRepository entries, StockService stocks,
                               NasdaqMetadataService metadata, RunUpService runUps, InsightFeedbackService feedback,
                               Clock clock) {
        this.transactions = transactions;
        this.entries = entries;
        this.stocks = stocks;
        this.metadata = metadata;
        this.runUps = runUps;
        this.feedback = feedback;
        this.clock = clock;
    }

    /** One stretch of owning a ticker: shares went from 0 to positive, and back to 0 if closed. */
    private static final class Period {
        final String ticker;
        final Instant openedAt;
        Instant closedAt;
        double closingPrice;
        double shares;
        /** Cost basis of the shares still held. */
        double cost;
        /** Total cost of every buy in the period. */
        double bought;
        double realized;

        Period(String ticker, Instant openedAt) {
            this.ticker = ticker;
            this.openedAt = openedAt;
        }
    }

    /** A buy's holding period, and its value against the cost basis of everything open just before it. */
    private record Buy(Period period, double weight) {}

    private record Ledger(List<Period> periods, Map<Integer, Buy> buys) {}

    private record Outcome(double price, String kind, LocalDate on) {}

    public BehaviorReportRequest build(User user) {
        // the ledger, not current holdings, is the source of ownership
        var chronological = transactions.findByUserIdOrderByTimestampDesc(user.getId()).stream().sorted(CHRONOLOGICAL).toList();
        var journal = entries.findByUserIdOrderByTimestampDesc(user.getId());
        var latest = new HashMap<String, Optional<Stock>>();
        var ledger = walk(chronological);

        // portfolio creation records each buy with the same ticker and instant as its generated entry
        Set<String> initialBuys = journal.stream()
                .filter(e -> e.getEntryType() == JournalEntryType.BUY && JournalEntryService.INITIAL_ENTRY_BODY.equals(e.getBody()))
                .filter(e -> e.getTicker() != null)
                .map(e -> key(e.getTicker()) + "@" + e.getTimestamp())
                .collect(Collectors.toSet());
        // ownership above comes from the full ledger; only rows hindsight can't accept are left out
        var sendable = chronological.stream()
                .filter(t -> sendable(t.getTicker()) && t.getShares() > 0 && t.getPrice() > 0).toList();
        var sent = sendable.subList(Math.max(0, sendable.size() - MAX_TRADES), sendable.size());
        // only buys that are sent fetch their run-up
        var runUpByKey = runUps.forBuys(sent.stream()
                .filter(t -> isBuy(t) && !initialBuys.contains(key(t.getTicker()) + "@" + t.getTimestamp()))
                .map(t -> RunUp.Key.of(t.getTicker(), t.getTimestamp())).toList());
        var trades = sent.stream()
                .map(t -> trade(t, isBuy(t) && initialBuys.contains(key(t.getTicker()) + "@" + t.getTimestamp()),
                        ledger.buys().get(t.getId()), runUpByKey, latest))
                .toList();

        var allPeriods = ledger.periods().stream()
                .filter(p -> sendable(p.ticker) && p.bought > 0)
                .sorted(Comparator.comparing((Period p) -> p.openedAt)).toList();
        var holdingPeriods = allPeriods.subList(Math.max(0, allPeriods.size() - MAX_PERIODS), allPeriods.size()).stream()
                .map(p -> new HoldingPeriod(key(p.ticker), p.openedAt, p.closedAt, p.bought, pnl(p, latest)))
                .toList();

        // every priced open position counts toward the portfolio's value, even one hindsight can't be sent
        var marketValues = new LinkedHashMap<Period, Double>();
        for (var period : ledger.periods()) {
            if (period.closedAt != null) continue;
            latestPrice(period.ticker, latest).map(stock -> period.shares * stock.getCurrentPrice())
                    .filter(value -> value > 0 && Double.isFinite(value))
                    .ifPresent(value -> marketValues.put(period, value));
        }
        Double portfolioValue = marketValues.isEmpty() ? null
                : marketValues.values().stream().mapToDouble(Double::doubleValue).sum();
        var holdings = marketValues.entrySet().stream()
                .filter(e -> sendable(e.getKey().ticker))
                .sorted(Map.Entry.<Period, Double>comparingByValue().reversed())
                .limit(MAX_HOLDINGS)
                .map(e -> new Position(key(e.getKey().ticker), e.getValue(), e.getValue() / portfolioValue,
                        sector(e.getKey().ticker), possibleMonthlyLoss(e.getKey().ticker, e.getValue())))
                .toList();

        var autoEntryIds = journal.stream().filter(JournalEntryService::isAutoWritten)
                .map(JournalEntry::getId).limit(MAX_AUTO_ENTRIES).toList();
        var reactions = feedback.list(user).stream().limit(MAX_FEEDBACK)
                .map(f -> new Feedback(f.behavior().kind(), f.behavior().subject(), f.reaction(), f.note(),
                        f.reportDay(), f.updatedAt()))
                .toList();
        var behaviorNotes = entries.findTop500ByUserIdAndBehaviorKeyIsNotNullOrderByTimestampDescIdDesc(user.getId())
                .stream().map(InsightFactsService::note).filter(Objects::nonNull).limit(MAX_NOTES).toList();

        return new BehaviorReportRequest(LocalDate.now(clock.withZone(JournalEntryFilters.MARKET_ZONE)),
                portfolioValue, trades, holdingPeriods, holdings, autoEntryIds, reactions, behaviorNotes);
    }

    /**
     * Average cost per ticker, chronologically. Selling what isn't held is ignored, as in RealizedPnlCalculator.
     * Each buy's weight is its value over the open cost basis just before it plus its value: deliberately
     * approximate, since it needs no historical prices.
     */
    private static Ledger walk(List<Transaction> chronological) {
        var periods = new ArrayList<Period>();
        var buys = new HashMap<Integer, Buy>();
        var open = new HashMap<String, Period>();
        for (var tx : chronological) {
            String key = key(tx.getTicker());
            Period period = open.get(key);
            if (isBuy(tx)) {
                double openCost = open.values().stream().mapToDouble(p -> p.cost).sum();
                if (period == null) {
                    period = new Period(tx.getTicker(), tx.getTimestamp());
                    open.put(key, period);
                    periods.add(period);
                }
                double value = tx.getTotalValue();
                buys.put(tx.getId(), new Buy(period, value / (openCost + value)));
                period.shares += tx.getShares();
                period.cost += value;
                period.bought += value;
            } else if (period != null) {
                double avgCost = period.cost / period.shares;
                double sold = Math.min(tx.getShares(), period.shares);
                period.realized += sold * (tx.getPrice() - avgCost);
                period.shares -= sold;
                period.cost -= avgCost * sold;
                if (period.shares <= EPSILON) {
                    period.closedAt = tx.getTimestamp();
                    period.closingPrice = tx.getPrice();
                    open.remove(key);
                }
            }
        }
        return new Ledger(periods, buys);
    }

    private LedgerTrade trade(Transaction tx, boolean initial, Buy buy, Map<RunUp.Key, RunUpService.Result> runUpByKey,
                              Map<String, Optional<Stock>> latest) {
        String ticker = key(tx.getTicker());
        if (!isBuy(tx) || buy == null) {
            var outcome = isBuy(tx) ? null : sinceSale(tx, latest);
            return new LedgerTrade(tx.getId(), ticker, tx.getType().name(), tx.getShares(), tx.getPrice(),
                    tx.getTimestamp(), false, null, RunUp.Status.UNAVAILABLE, null, outcome == null ? null : outcome.price(),
                    outcome == null ? null : outcome.kind(), outcome == null ? null : outcome.on());
        }
        var runUp = initial ? null : runUpByKey.get(RunUp.Key.of(tx.getTicker(), tx.getTimestamp()));
        RunUp.Status status = runUp == null ? RunUp.Status.UNAVAILABLE : runUp.status();
        Double runUpValue = status == RunUp.Status.KNOWN ? runUp.runUp() : null;
        // hindsight needs a figure with KNOWN
        if (status == RunUp.Status.KNOWN && (runUpValue == null || !Double.isFinite(runUpValue))) {
            status = RunUp.Status.UNAVAILABLE;
            runUpValue = null;
        }
        Double weight = Double.isFinite(buy.weight()) && buy.weight() >= 0 ? buy.weight() : null;
        var outcome = outcome(buy.period(), latest);
        return new LedgerTrade(tx.getId(), ticker, tx.getType().name(), tx.getShares(), tx.getPrice(), tx.getTimestamp(),
                initial, runUpValue, status, weight, outcome == null ? null : outcome.price(),
                outcome == null ? null : outcome.kind(), outcome == null ? null : outcome.on());
    }

    /** The sale that closed the buy's holding period, or the latest stored price while it's open. */
    private Outcome outcome(Period period, Map<String, Optional<Stock>> latest) {
        if (period.closedAt != null) {
            return period.closingPrice > 0 ? new Outcome(period.closingPrice, "SOLD", day(period.closedAt)) : null;
        }
        return latestPrice(period.ticker, latest)
                .map(stock -> new Outcome(stock.getCurrentPrice(), "LATEST", day(stock.getTimestamp())))
                .orElse(null);
    }

    /** A sell's price since: the latest stored price, held or not, only from a New York day after the sale's. */
    private Outcome sinceSale(Transaction sell, Map<String, Optional<Stock>> latest) {
        LocalDate soldOn = day(sell.getTimestamp());
        return latestPrice(sell.getTicker(), latest)
                .map(stock -> new Outcome(stock.getCurrentPrice(), "LATEST", day(stock.getTimestamp())))
                .filter(outcome -> outcome.on().isAfter(soldOn))
                .orElse(null);
    }

    /** Realized when closed; an open period adds its partial sells' realized P/L to the unrealized rest. */
    private Double pnl(Period period, Map<String, Optional<Stock>> latest) {
        if (period.closedAt != null) return period.realized;
        return latestPrice(period.ticker, latest)
                .map(stock -> period.realized + period.shares * stock.getCurrentPrice() - period.cost)
                .orElse(null);
    }

    /** "A bad month, about 1 in 20": marketValue × 1.65 × σ × √21, from σ of stored daily returns. */
    private Double possibleMonthlyLoss(String ticker, double marketValue) {
        // one return per New York day, in case a day's EOD fetch was stored twice
        var byDay = new LinkedHashMap<LocalDate, Double>();
        for (var eod : stocks.getEodStockData(ticker)) {
            if (eod.getTimestamp() == null || eod.getPrevClose() <= 0 || eod.getCurrentPrice() <= 0) continue;
            byDay.put(day(eod.getTimestamp()), eod.getCurrentPrice() / eod.getPrevClose() - 1);
        }
        Double sigma = dailyVolatility(byDay.values().stream().mapToDouble(Double::doubleValue).toArray());
        if (sigma == null) return null;
        double loss = marketValue * 1.65 * sigma * Math.sqrt(21);
        return Double.isFinite(loss) ? loss : null;
    }

    /** The sample standard deviation of daily returns, or null with fewer than {@link #MIN_RETURNS}. */
    static Double dailyVolatility(double[] returns) {
        if (returns.length < MIN_RETURNS) return null;
        double mean = 0;
        for (double r : returns) mean += r;
        mean /= returns.length;
        double squares = 0;
        for (double r : returns) squares += (r - mean) * (r - mean);
        double sigma = Math.sqrt(squares / (returns.length - 1));
        return Double.isFinite(sigma) ? sigma : null;
    }

    private String sector(String ticker) {
        return metadata.lookupMetadata(key(ticker)).map(StockMetadata::getSector)
                .filter(sector -> !sector.isBlank() && sector.length() <= MAX_SECTOR)
                .orElse(null);
    }

    /** An entry written from a behavior's Explore view; a key that no longer parses is left out. */
    private static BehaviorNote note(JournalEntry entry) {
        try {
            var behavior = BehaviorKey.parse(entry.getBehaviorKey());
            return new BehaviorNote(behavior.kind(), behavior.subject(), entry.getId());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private Optional<Stock> latestPrice(String ticker, Map<String, Optional<Stock>> latest) {
        return latest.computeIfAbsent(key(ticker), k -> stocks.getLatestStockData(ticker)
                .filter(stock -> stock.getCurrentPrice() > 0 && stock.getTimestamp() != null));
    }

    private static boolean isBuy(Transaction tx) {
        return tx.getType() == Transaction.TransactionType.BUY;
    }

    private static LocalDate day(Instant instant) {
        return instant.atZone(JournalEntryFilters.MARKET_ZONE).toLocalDate();
    }

    static boolean sendable(String ticker) {
        return TICKER.matcher(key(ticker)).matches();
    }

    private static String key(String ticker) {
        return ticker.toUpperCase(Locale.ROOT);
    }
}
