package me.vestry.service;

import me.vestry.api.HindsightClient.EntryOutcome;
import me.vestry.api.HindsightClient.HoldingPeriod;
import me.vestry.api.HindsightClient.LedgerTrade;
import me.vestry.api.HindsightClient.PatternReportRequest;
import me.vestry.model.JournalEntry;
import me.vestry.model.JournalEntryType;
import me.vestry.model.Stock;
import me.vestry.model.Transaction;
import me.vestry.model.User;
import me.vestry.repository.JournalEntryRepository;
import me.vestry.repository.TransactionRepository;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Insights: the market and ledger facts hindsight needs to find patterns. Hindsight trusts these numbers
 * and reads entry text itself, so only IDs and numbers leave here.
 */
@Service
public class InsightFactsService {
    /** Hindsight's contract caps each list. */
    static final int MAX_OUTCOMES = 500;
    static final int MAX_TRADES = 1000;
    static final int MAX_PERIODS = 1000;
    static final int MAX_AUTO_ENTRIES = 1000;
    private static final double EPSILON = 1e-9;
    /** Hindsight's ticker rule; one row it rejects fails the whole request. */
    private static final Pattern TICKER = Pattern.compile("[A-Z][A-Z0-9.\\-]{0,9}");
    private static final Comparator<Transaction> CHRONOLOGICAL = Comparator.comparing(Transaction::getTimestamp)
            .thenComparingInt(Transaction::getId);

    private final TransactionRepository transactions;
    private final JournalEntryRepository entries;
    private final StockService stocks;
    private final Clock clock;

    public InsightFactsService(TransactionRepository transactions, JournalEntryRepository entries,
                               StockService stocks, Clock clock) {
        this.transactions = transactions;
        this.entries = entries;
        this.stocks = stocks;
        this.clock = clock;
    }

    /** One stretch of owning a ticker: shares went from 0 to positive, and back to 0 if closed. */
    private static final class Period {
        final String ticker;
        final Instant openedAt;
        Instant closedAt;
        double closingPrice;
        double shares;
        double cost;
        double realized;

        Period(String ticker, Instant openedAt) {
            this.ticker = ticker;
            this.openedAt = openedAt;
        }

        boolean contains(Instant when) {
            return !when.isBefore(openedAt) && (closedAt == null || !when.isAfter(closedAt));
        }
    }

    public PatternReportRequest build(User user) {
        // the ledger, not current holdings, is the source of ownership
        var ledger = transactions.findByUserIdOrderByTimestampDesc(user.getId()).stream().sorted(CHRONOLOGICAL).toList();
        var journal = entries.findByUserIdOrderByTimestampDesc(user.getId());
        var latest = new HashMap<String, Optional<Stock>>();
        var periods = periods(ledger);

        var outcomes = journal.stream()
                .filter(e -> e.getTicker() != null && !e.getTicker().isBlank())
                .filter(e -> e.getPriceSnapshot() != null && e.getPriceSnapshot() > 0)
                .map(e -> outcome(e, periods.getOrDefault(key(e.getTicker()), List.of()), latest))
                .filter(Objects::nonNull)
                .limit(MAX_OUTCOMES)
                .toList();

        // portfolio creation records each buy with the same ticker and instant as its generated entry
        Set<String> initialBuys = journal.stream()
                .filter(e -> e.getEntryType() == JournalEntryType.BUY && JournalEntryService.INITIAL_ENTRY_BODY.equals(e.getBody()))
                .filter(e -> e.getTicker() != null)
                .map(e -> key(e.getTicker()) + "@" + e.getTimestamp())
                .collect(Collectors.toSet());
        // ownership above comes from the full ledger; only rows hindsight can't accept are left out
        var sendable = ledger.stream()
                .filter(t -> sendable(t.getTicker()) && t.getShares() > 0 && t.getPrice() > 0).toList();
        var trades = sendable.subList(Math.max(0, sendable.size() - MAX_TRADES), sendable.size()).stream()
                .map(t -> new LedgerTrade(t.getId(), key(t.getTicker()), t.getType().name(), t.getShares(), t.getPrice(),
                        t.getTimestamp(), t.getType() == Transaction.TransactionType.BUY
                                && initialBuys.contains(key(t.getTicker()) + "@" + t.getTimestamp())))
                .toList();

        var allPeriods = periods.values().stream().flatMap(List::stream)
                .filter(p -> sendable(p.ticker))
                .sorted(Comparator.comparing((Period p) -> p.openedAt)).toList();
        var holdingPeriods = allPeriods.subList(Math.max(0, allPeriods.size() - MAX_PERIODS), allPeriods.size()).stream()
                .map(p -> new HoldingPeriod(key(p.ticker), p.openedAt, p.closedAt, pnl(p, latest)))
                .toList();

        var autoEntryIds = journal.stream().filter(JournalEntryService::isAutoWritten)
                .map(JournalEntry::getId).limit(MAX_AUTO_ENTRIES).toList();

        return new PatternReportRequest(LocalDate.now(clock.withZone(JournalEntryFilters.MARKET_ZONE)),
                outcomes, trades, holdingPeriods, autoEntryIds);
    }

    /** Average cost per ticker, chronologically. Selling what isn't held is ignored, as in RealizedPnlCalculator. */
    private static Map<String, List<Period>> periods(List<Transaction> chronological) {
        var byTicker = new HashMap<String, List<Period>>();
        var open = new HashMap<String, Period>();
        for (var tx : chronological) {
            String key = key(tx.getTicker());
            Period period = open.get(key);
            if (tx.getType() == Transaction.TransactionType.BUY) {
                if (period == null) {
                    period = new Period(tx.getTicker(), tx.getTimestamp());
                    open.put(key, period);
                    byTicker.computeIfAbsent(key, k -> new ArrayList<>()).add(period);
                }
                period.shares += tx.getShares();
                period.cost += tx.getTotalValue();
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
        return byTicker;
    }

    /** Realized when closed; an open period adds its partial sells' realized P/L to the unrealized rest. */
    private Double pnl(Period period, Map<String, Optional<Stock>> latest) {
        if (period.closedAt != null) return period.realized;
        return latestPrice(period.ticker, latest)
                .map(stock -> period.realized + period.shares * stock.getCurrentPrice() - period.cost)
                .orElse(null);
    }

    private EntryOutcome outcome(JournalEntry entry, List<Period> periods, Map<String, Optional<Stock>> latest) {
        var period = periodOf(entry.getTimestamp(), periods);
        if (period != null && period.closedAt != null) {
            return new EntryOutcome(entry.getId(), period.closingPrice, "SOLD", day(period.closedAt));
        }
        return latestPrice(entry.getTicker(), latest)
                .map(stock -> new EntryOutcome(entry.getId(), stock.getCurrentPrice(), "LATEST", day(stock.getTimestamp())))
                .orElse(null);
    }

    /**
     * The period containing the entry, or else the nearest one opening or closing on the entry's New York day:
     * people write a buy note just before recording the trade, or a sell note just after.
     */
    private static Period periodOf(Instant written, List<Period> periods) {
        LocalDate writtenOn = day(written);
        Period nearest = null;
        Duration nearestGap = null;
        for (var period : periods) {
            if (period.contains(written)) return period;
            Duration gap = null;
            if (written.isBefore(period.openedAt) && day(period.openedAt).equals(writtenOn)) {
                gap = Duration.between(written, period.openedAt);
            } else if (period.closedAt != null && written.isAfter(period.closedAt) && day(period.closedAt).equals(writtenOn)) {
                gap = Duration.between(period.closedAt, written);
            }
            if (gap != null && (nearestGap == null || gap.compareTo(nearestGap) < 0)) {
                nearest = period;
                nearestGap = gap;
            }
        }
        return nearest;
    }

    private Optional<Stock> latestPrice(String ticker, Map<String, Optional<Stock>> latest) {
        return latest.computeIfAbsent(key(ticker), k -> stocks.getLatestStockData(ticker)
                .filter(stock -> stock.getCurrentPrice() > 0 && stock.getTimestamp() != null));
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
