package me.vestry.service;

import lombok.RequiredArgsConstructor;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import me.vestry.api.OpenAiClient;
import me.vestry.repository.JournalEntryRepository;
import me.vestry.repository.PortfolioRepository;
import me.vestry.repository.TransactionRepository;
import me.vestry.repository.PortfolioDigestRepository;
import me.vestry.model.User;
import me.vestry.model.Portfolio;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
public class DigestContextService {
    private final DemoSessionResolver users;
    private final PortfolioService portfolios;
    private final JournalEntryRepository journal;
    private final NasdaqMetadataService metadata;
    private final OpenAiClient client;
    private final ObjectMapper mapper;
    private final Clock clock;
    private final PortfolioRepository savedPortfolios;
    private final TransactionRepository transactions;
    private final PortfolioDigestRepository digests;

    public record Snapshot(int userId, boolean demo, Instant capturedAt, List<String> tickers, String json) {
        public Snapshot { tickers = List.copyOf(tickers); }
    }

    /** Capture on the authenticated request thread. Workers receive immutable data, never session objects. */
    @Transactional(readOnly = true)
    public Snapshot capture() {
        if (!client.isConfigured()) throw new IllegalStateException("AI is disabled");
        var user = users.getCurrentUser();
        // Persistent demo template only: visitor edits must never enter the shared demo digest.
        return capture(user, portfolios.getPortfolio());
    }

    /** Read the persistent demo template without impersonating a visitor or accessing session state. */
    @Transactional(readOnly = true)
    public Snapshot captureDemo(User user) {
        if (!client.isConfigured()) throw new IllegalStateException("AI is disabled");
        if (!user.isDemo()) throw new IllegalArgumentException("Scheduled briefings are demo-only");
        return capture(user, savedPortfolios.findByUserId(user.getId()).orElse(null));
    }

    private Snapshot capture(User user, Portfolio portfolio) {
        var now = clock.instant();
        var root = mapper.createObjectNode().put("capturedAt", now.toString()).put("journalIsRecentSample", true);
        var previous = digests.findTop3ByUserIdAndCapturedAtLessThanEqualOrderByGeneratedAtDesc(user.getId(), now);
        // Compare activity to the last capture, capped at a week after an absence or on first use.
        var weekAgo = now.minus(Duration.ofDays(7));
        var since = previous.isEmpty() || previous.get(0).getCapturedAt().isBefore(weekAgo)
                ? weekAgo : previous.get(0).getCapturedAt();
        root.put("activitySinceExclusive", since.toString());
        root.put("activityThroughInclusive", now.toString());
        root.put("activityIsRecentSample", true);
        var memory = root.putArray("previousCoverage");
        for (var digest : previous) {
            if (digest.getCapturedAt().isBefore(weekAgo)) continue;
            var content = digest.getContent();
            // Never recycle generated prose as factual context. Keep only navigation/repetition hints.
            var coverage = memory.addObject().put("capturedAt", digest.getCapturedAt().toString())
                    .put("nextStep", clip(content.path("questions").path(0).path("text").asText(), 100));
            var links = coverage.putArray("sourceUrls");
            content.path("sources").forEach(source -> {
                if (links.size() < 2) links.add(clip(source.path("url").asText(), 512));
            });
        }
        var activity = root.putArray("recentTransactions");
        for (var trade : transactions.findTop12ByUserIdAndTimestampGreaterThanAndTimestampLessThanEqualOrderByTimestampDescIdDesc(
                user.getId(), since, now)) {
            activity.addObject().put("ticker", trade.getTicker()).put("type", trade.getType().name())
                    .put("shares", trade.getShares()).put("price", trade.getPrice())
                    .put("timestamp", trade.getTimestamp().toString());
        }
        var positions = root.putArray("holdings");
        double total = 0;
        boolean complete = true;
        if (portfolio != null && portfolio.getHoldings() != null) {
            if (portfolio.getHoldings().size() > 8) throw new IllegalStateException("Digest holding limit exceeded");
            for (var holding : portfolio.getHoldings()) {
                var item = positions.addObject().put("ticker", holding.getTicker()).put("shares", holding.getShares());
                var stock = portfolios.getStockData(holding.getTicker());
                Double value = stock == null ? null : finite(stock.getCurrentPrice() * holding.getShares());
                boolean priced = value != null && stock.getCurrentPrice() > 0 && stock.getTimestamp() != null;
                complete &= priced;
                item.set("marketValue", mapper.valueToTree(priced ? value : null));
                if (priced) {
                    total += value;
                    item.put("priceAsOf", stock.getTimestamp().toString());
                }
                metadata.lookupMetadata(holding.getTicker()).ifPresent(m -> {
                    var details = item.putObject("metadata");
                    details.put("name", clip(m.getName(), 100)).put("sector", clip(m.getSector(), 60))
                            .put("industry", clip(m.getIndustry(), 80)).put("country", clip(m.getCountry(), 40));
                });
            }
        }
        root.set("portfolioValue", mapper.valueToTree(complete ? finite(total) : null));
        for (var position : positions) {
            if (complete && total > 0) ((ObjectNode) position).put("weightPercent", position.path("marketValue").asDouble() / total * 100);
        }
        var entries = root.putArray("journal");
        for (var entry : journal.findTop6ByUserIdOrderByTimestampDescIdDesc(user.getId())) {
            if (entry.getTimestamp().isAfter(now) || entry.getTimestamp().isBefore(now.minus(Duration.ofDays(30)))) continue;
            entries.addObject().put("newSincePreviousBriefing", entry.getTimestamp().isAfter(since))
                    .put("type", entry.getEntryType().name()).put("ticker", entry.getTicker())
                    .put("timestamp", entry.getTimestamp().toString()).put("body", clip(entry.getBody(), 400));
        }
        // Bound serialized UTF-8, including escaped/multilingual text, rather than assuming ASCII.
        if (bytes(root) > 6500) positions.forEach(p -> ((ObjectNode) p).remove("metadata"));
        while (bytes(root) > 6500 && memory.size() > 1) memory.remove(memory.size() - 1);
        while (bytes(root) > 6500 && entries.size() > 1) entries.remove(entries.size() - 1);
        while (bytes(root) > 6500 && activity.size() > 1) activity.remove(activity.size() - 1);
        while (bytes(root) > 6500 && !entries.isEmpty()) entries.remove(entries.size() - 1);
        if (bytes(root) > 6500) throw new IllegalStateException("Digest context is too large");
        root.put("journalEntriesIncluded", entries.size());
        var tickers = new java.util.ArrayList<String>();
        positions.forEach(p -> tickers.add(p.path("ticker").asText()));
        return new Snapshot(user.getId(), user.isDemo(), now, tickers, root.toString());
    }

    private static Double finite(double value) { return Double.isFinite(value) ? value : null; }
    private static String clip(String value, int length) {
        if (value == null) return null;
        return value.codePoints().limit(length).collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append).toString();
    }
    private static int bytes(ObjectNode value) { return value.toString().getBytes(StandardCharsets.UTF_8).length; }
}
