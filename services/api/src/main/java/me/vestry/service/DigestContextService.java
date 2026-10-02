package me.vestry.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import me.vestry.api.OpenAiClient;
import me.vestry.repository.JournalEntryRepository;
import me.vestry.repository.PortfolioRepository;
import me.vestry.repository.TransactionRepository;
import me.vestry.model.User;
import me.vestry.model.Portfolio;
import me.vestry.dto.PnLSummaryDTO;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.List;

@Service
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

    public DigestContextService(DemoSessionResolver users, PortfolioService portfolios, JournalEntryRepository journal,
                                NasdaqMetadataService metadata, OpenAiClient client, ObjectMapper mapper, Clock aiClock,
                                PortfolioRepository savedPortfolios, TransactionRepository transactions) {
        this.users = users;
        this.portfolios = portfolios;
        this.journal = journal;
        this.metadata = metadata;
        this.client = client;
        this.mapper = mapper;
        clock = aiClock;
        this.savedPortfolios = savedPortfolios;
        this.transactions = transactions;
    }

    public record Snapshot(int userId, boolean demo, Instant capturedAt, List<String> tickers, String json) {
        public Snapshot { tickers = List.copyOf(tickers); }
    }

    /** Capture on the authenticated request thread. Workers receive immutable data, never session objects. */
    @Transactional(readOnly = true)
    public Snapshot capture() {
        if (!client.isConfigured()) throw new IllegalStateException("AI is disabled");
        var user = users.getCurrentUser();
        // Persistent demo template only: visitor edits must never enter the shared demo digest.
        return capture(user, portfolios.getPortfolio(), portfolios.getPnLSummary());
    }

    /** Read the persistent demo template without impersonating a visitor or accessing session state. */
    @Transactional(readOnly = true)
    public Snapshot captureDemo(User user) {
        if (!client.isConfigured()) throw new IllegalStateException("AI is disabled");
        if (!user.isDemo()) throw new IllegalArgumentException("Scheduled briefings are demo-only");
        return capture(user, savedPortfolios.findByUserId(user.getId()).orElse(null),
                portfolios.calculatePnLSummary(transactions.findByUserIdOrderByTimestampDesc(user.getId())));
    }

    private Snapshot capture(User user, Portfolio portfolio, PnLSummaryDTO pnl) {
        var now = clock.instant();
        var root = mapper.createObjectNode().put("capturedAt", now.toString()).put("journalIsRecentSample", true);
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
        root.set("realizedPnl", mapper.valueToTree(finite(pnl.getRealizedPnL())));
        root.set("unrealizedPnl", mapper.valueToTree(complete ? finite(pnl.getUnrealizedPnL()) : null));
        root.set("totalPnlPercent", mapper.valueToTree(complete ? finite(pnl.getTotalPnLPercent()) : null));
        for (var position : positions) {
            if (complete && total > 0) ((ObjectNode) position).put("weightPercent", position.path("marketValue").asDouble() / total * 100);
        }
        var entries = root.putArray("journal");
        for (var entry : journal.findTop6ByUserIdOrderByTimestampDescIdDesc(user.getId())) {
            entries.addObject().put("type", entry.getEntryType().name()).put("ticker", entry.getTicker())
                    .put("timestamp", entry.getTimestamp().toString()).put("body", clip(entry.getBody(), 400));
        }
        // Bound serialized UTF-8, including escaped/multilingual text, rather than assuming ASCII.
        while (bytes(root) > 6500 && !entries.isEmpty()) entries.remove(entries.size() - 1);
        if (bytes(root) > 6500) positions.forEach(p -> ((ObjectNode) p).remove("metadata"));
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
