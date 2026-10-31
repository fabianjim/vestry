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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * The run-up before each buy: one Tiingo EOD request per ticker and New York buy day, ever. It's fetched lazily
 * when a report is built and drained hourly in the background, both under one throttle that leaves Tiingo's free
 * plan (50 requests an hour, 1000 a day) room for the hourly price fetches.
 */
@Service
public class RunUpService {
    private static final Logger log = LoggerFactory.getLogger(RunUpService.class);
    /** The run-up spans 20 trading days, so it needs 21 closes before the buy day. */
    static final int TRADING_DAYS = 20;
    /** 35 calendar days hold at least 23 trading days, even around holidays. */
    static final int LOOKBACK_DAYS = 35;

    private final MarketDataClient market;
    private final RunUpRepository runUps;
    private final TransactionRepository transactions;
    private final JournalEntryRepository entries;
    private final Clock clock;
    private final int hourlyLimit;
    private final int dailyLimit;
    /** Instance-local, like the rest of the price fetching: production runs one instance. */
    private final Deque<Instant> requests = new ArrayDeque<>();

    public RunUpService(MarketDataClient market, RunUpRepository runUps, TransactionRepository transactions,
                        JournalEntryRepository entries, Clock clock,
                        @Value("${vestry.run-up.hourly-limit:30}") int hourlyLimit,
                        @Value("${vestry.run-up.daily-limit:300}") int dailyLimit) {
        this.market = market;
        this.runUps = runUps;
        this.transactions = transactions;
        this.entries = entries;
        this.clock = clock;
        this.hourlyLimit = hourlyLimit;
        this.dailyLimit = dailyLimit;
    }

    public record Result(RunUp.Status status, Double runUp) {
        static final Result PENDING = new Result(RunUp.Status.PENDING, null);
    }

    /** Every key's run-up, fetching unfetched ones (newest first) while the throttle allows. */
    public Map<RunUp.Key, Result> forBuys(Collection<RunUp.Key> keys) {
        var distinct = new LinkedHashSet<>(keys);
        var stored = new HashMap<RunUp.Key, RunUp>();
        runUps.findAllById(distinct).forEach(runUp -> stored.put(runUp.getKey(), runUp));
        var pending = distinct.stream().filter(key -> !stored.containsKey(key)).toList();
        fetch(pending).forEach(runUp -> stored.put(runUp.getKey(), runUp));
        return distinct.stream().collect(Collectors.toMap(key -> key,
                key -> stored.containsKey(key) ? result(stored.get(key)) : Result.PENDING));
    }

    // At :20, away from the hourly price fetches on the hour.
    @Scheduled(cron = "0 20 * * * *", zone = "America/New_York")
    public void drain() {
        try {
            var initial = entries.findBuyEntriesWithBody(JournalEntryService.INITIAL_ENTRY_BODY).stream()
                    .map(RunUpService::moment).collect(Collectors.toSet());
            var fetched = runUps.findAll().stream().map(RunUp::getKey).collect(Collectors.toSet());
            var pending = transactions.findAllBuys().stream()
                    .filter(buy -> !initial.contains(moment(buy)) && InsightFactsService.sendable(buy.getTicker()))
                    .sorted(Comparator.comparing(TickerMoment::getTimestamp).reversed())
                    .map(buy -> RunUp.Key.of(buy.getTicker(), buy.getTimestamp()))
                    .filter(key -> !fetched.contains(key))
                    .distinct().toList();
            if (pending.isEmpty()) return;
            int done = fetch(pending).size();
            log.info("Run-up drain fetched {} of {} pending", done, pending.size());
        } catch (RuntimeException e) {
            log.warn("Run-up drain failed: {}", e.getClass().getSimpleName());
        }
    }

    /**
     * Fetches in order until the throttle or Tiingo stops it. Serialized, so the drain and a report build never fetch
     * the same key twice. An unknown ticker or too little history is UNAVAILABLE; any other failure leaves it PENDING.
     */
    private synchronized List<RunUp> fetch(List<RunUp.Key> pending) {
        var saved = new ArrayList<RunUp>();
        for (var key : pending) {
            var existing = runUps.findById(key);
            if (existing.isPresent()) {
                saved.add(existing.get());
                continue;
            }
            if (!acquire()) break;
            RunUp runUp;
            try {
                var closes = market.getDailyCloses(key.ticker(), key.buyDay().minusDays(LOOKBACK_DAYS), key.buyDay());
                Double value = runUp(closes, key);
                runUp = value == null ? RunUp.unavailable(key, clock.instant()) : RunUp.known(key, value, clock.instant());
            } catch (UnknownTickerException e) {
                runUp = RunUp.unavailable(key, clock.instant());
            } catch (PriceFetchException e) {
                // a response this ticker's day can't be read from; another key may still work
                continue;
            } catch (RestClientException e) {
                // rate limited, unauthorized or unreachable: every later request would fail the same way
                log.warn("Run-up fetch stopped: {}", e.getClass().getSimpleName());
                break;
            }
            saved.add(runUps.save(runUp));
        }
        return saved;
    }

    /** The change from the close 20 trading days before the last close before the buy day, to that close. */
    static Double runUp(List<DailyClose> closes, RunUp.Key key) {
        var before = closes.stream().filter(close -> close.date().isBefore(key.buyDay()))
                .sorted(Comparator.comparing(DailyClose::date)).toList();
        if (before.size() < TRADING_DAYS + 1) return null;
        double end = before.get(before.size() - 1).adjClose();
        double start = before.get(before.size() - 1 - TRADING_DAYS).adjClose();
        double value = end / start - 1;
        return Double.isFinite(value) ? value : null;
    }

    private boolean acquire() {
        Instant now = clock.instant();
        while (!requests.isEmpty() && !requests.peekFirst().isAfter(now.minus(Duration.ofDays(1)))) requests.removeFirst();
        Instant hourAgo = now.minus(Duration.ofHours(1));
        long lastHour = requests.stream().filter(at -> at.isAfter(hourAgo)).count();
        if (lastHour >= hourlyLimit || requests.size() >= dailyLimit) return false;
        requests.addLast(now);
        return true;
    }

    private static Result result(RunUp runUp) {
        return new Result(runUp.getStatus(), runUp.getValue());
    }

    /** Portfolio creation records each buy with the same ticker and instant as its generated entry. */
    private static String moment(TickerMoment moment) {
        return moment.getUserId() + ":" + moment.getTicker().toUpperCase(Locale.ROOT) + "@" + moment.getTimestamp();
    }
}
