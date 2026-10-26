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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

/** Reflect with AI: vestry computes the facts, hindsight writes the recap and questions. */
@Service
public class ReflectionAidService {
    /** Hindsight's contract caps both lists; it reads only the newest later entries anyway. */
    static final int MAX_LATER_ENTRIES = 50;
    static final int MAX_TRADES = 20;

    private final HindsightClient hindsight;
    private final JournalEntryRepository entries;
    private final TransactionRepository transactions;
    private final StockService stocks;

    public ReflectionAidService(HindsightClient hindsight, JournalEntryRepository entries,
                                TransactionRepository transactions, StockService stocks) {
        this.hindsight = hindsight;
        this.entries = entries;
        this.transactions = transactions;
        this.stocks = stocks;
    }

    public boolean available() {
        return hindsight.isEnabled();
    }

    /** The facts are computed fresh on every call, even when hindsight returns today's saved aid. */
    public record Reflection(AidResponse response, Since since) {}

    @Transactional(readOnly = true)
    public Reflection reflect(User user, int entryId) {
        var entry = entries.findById(entryId).filter(e -> e.getUser().getId() == user.getId()).orElse(null);
        if (entry == null) return new Reflection(AidResponse.of(AidStatus.NOT_FOUND), null);
        var since = since(user, entry);
        return new Reflection(hindsight.reflectionAid(user.getId(), entryId, laterEntryIds(user, entry), since), since);
    }

    /** Same-ticker entries written after this one, plus reflections on it (which matter when it has no ticker). */
    List<Integer> laterEntryIds(User user, JournalEntry entry) {
        var sameTicker = hasTicker(entry) ? entries.findByUserIdAndTicker(user.getId(), entry.getTicker()) : List.<JournalEntry>of();
        return Stream.concat(sameTicker.stream(), entries.findByUserIdAndSourceEntryId(user.getId(), entry.getId()).stream())
                .filter(e -> e.getId() != entry.getId() && e.getTimestamp().isAfter(entry.getTimestamp()))
                .sorted(Comparator.comparing(JournalEntry::getTimestamp).reversed())
                .map(JournalEntry::getId).distinct().limit(MAX_LATER_ENTRIES).toList();
    }

    Since since(User user, JournalEntry entry) {
        if (!hasTicker(entry)) return new Since(null, null, List.of());
        var ledger = transactions.findByUserIdAndTicker(user.getId(), entry.getTicker());
        // the ledger, not current holdings, is the source of ownership
        double shares = ledger.stream()
                .mapToDouble(t -> t.getType() == Transaction.TransactionType.BUY ? t.getShares() : -t.getShares()).sum();
        var trades = ledger.stream()
                .filter(t -> t.getTimestamp().isAfter(entry.getTimestamp()))
                .sorted(Comparator.comparing(Transaction::getTimestamp).reversed())
                .limit(MAX_TRADES)
                .sorted(Comparator.comparing(Transaction::getTimestamp))
                .map(t -> new Trade(t.getTimestamp().atZone(JournalEntryFilters.MARKET_ZONE).toLocalDate(),
                        t.getType().name(), t.getShares(), t.getPrice()))
                .toList();
        Double priceNow = stocks.getLatestStockData(entry.getTicker()).map(Stock::getCurrentPrice)
                .filter(price -> price > 0).orElse(null);
        return new Since(priceNow, Math.max(0, shares), trades);
    }

    private static boolean hasTicker(JournalEntry entry) {
        return entry.getTicker() != null && !entry.getTicker().isBlank();
    }
}
