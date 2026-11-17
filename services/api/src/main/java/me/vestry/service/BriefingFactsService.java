package me.vestry.service;

import lombok.RequiredArgsConstructor;
import me.vestry.api.HindsightClient.BriefingHolding;
import me.vestry.api.HindsightClient.BriefingRequest;
import me.vestry.api.HindsightClient.BriefingTrade;
import me.vestry.api.HindsightClient.HoldingMetadata;
import me.vestry.model.Holding;
import me.vestry.model.User;
import me.vestry.repository.PortfolioRepository;
import me.vestry.repository.TransactionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * The portfolio facts hindsight's briefing sees, read from the saved account (never a demo visitor's copy).
 * Hindsight reads the journal and its own earlier briefings itself. A row hindsight would reject is left out,
 * since one bad row fails the whole request.
 */
@Service
@RequiredArgsConstructor
public class BriefingFactsService {
    static final int MAX_HOLDINGS = 8;
    /** Hindsight only looks back a week, and keeps the newest 12 trades after its own cutoff. */
    static final Duration ACTIVITY = Duration.ofDays(7);
    private static final Pattern TICKER = Pattern.compile("[A-Za-z][A-Za-z0-9.-]{0,9}");

    private final PortfolioRepository portfolios;
    private final PortfolioService prices;
    private final TransactionRepository transactions;
    private final NasdaqMetadataService metadata;
    private final Clock clock;

    @Transactional(readOnly = true)
    public BriefingRequest capture(User user) {
        return build(user, false);
    }

    @Transactional(readOnly = true)
    public BriefingRequest captureDemo(User template) {
        if (!template.isDemo()) throw new IllegalArgumentException("Scheduled briefings are demo-only");
        return build(template, true);
    }

    private BriefingRequest build(User user, boolean demo) {
        var now = clock.instant();
        var held = portfolios.findByUserId(user.getId())
                .map(p -> p.getHoldings() == null ? List.<Holding>of() : p.getHoldings()).orElse(List.of());
        var holdings = new ArrayList<BriefingHolding>();
        boolean complete = held.size() <= MAX_HOLDINGS;
        double total = 0;
        for (var holding : held.stream().limit(MAX_HOLDINGS).toList()) {
            if (!validTicker(holding.getTicker()) || !positive(holding.getShares())) {
                complete = false;
                continue;
            }
            var stock = prices.getStockData(holding.getTicker());
            Double value = stock == null || !positive(stock.getCurrentPrice()) || stock.getTimestamp() == null
                    ? null : finite(stock.getCurrentPrice() * holding.getShares());
            complete &= value != null;
            if (value != null) total += value;
            var details = metadata.lookupMetadata(holding.getTicker())
                    .map(m -> new HoldingMetadata(clip(m.getName(), 100), clip(m.getSector(), 60),
                            clip(m.getIndustry(), 80), clip(m.getCountry(), 40)))
                    .orElse(null);
            holdings.add(new BriefingHolding(holding.getTicker(), holding.getShares(), value,
                    value == null ? null : stock.getTimestamp(), null, details));
        }
        // weights only when every holding is priced, so they add up to the whole portfolio
        if (complete && total > 0) {
            double whole = total;
            holdings.replaceAll(h -> new BriefingHolding(h.ticker(), h.shares(), h.marketValue(), h.priceAsOf(),
                    Math.min(100, h.marketValue() / whole * 100), h.metadata()));
        }
        var trades = transactions.findTop12ByUserIdAndTimestampGreaterThanAndTimestampLessThanEqualOrderByTimestampDescIdDesc(
                        user.getId(), now.minus(ACTIVITY), now).stream()
                .filter(t -> validTicker(t.getTicker()) && positive(t.getShares()) && positive(t.getPrice()))
                .map(t -> new BriefingTrade(t.getTicker(), t.getType().name(), t.getShares(), t.getPrice(), t.getTimestamp()))
                .toList();
        return new BriefingRequest(now, demo, complete ? finite(total) : null, holdings, trades);
    }

    private static boolean validTicker(String ticker) {
        return ticker != null && TICKER.matcher(ticker).matches();
    }

    private static boolean positive(double value) {
        return Double.isFinite(value) && value > 0;
    }

    private static Double finite(double value) {
        return Double.isFinite(value) ? value : null;
    }

    private static String clip(String value, int length) {
        if (value == null) return null;
        return value.codePoints().limit(length)
                .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append).toString();
    }
}
