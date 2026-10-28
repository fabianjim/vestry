package me.vestry.service;

import me.vestry.api.HindsightClient;
import me.vestry.api.HindsightClient.Citation;
import me.vestry.api.HindsightClient.Claim;
import me.vestry.api.HindsightClient.ReflectionAid;
import me.vestry.api.HindsightClient.Since;
import me.vestry.api.HindsightClient.Trade;
import me.vestry.model.DemoSession;
import me.vestry.model.JournalEntry;
import me.vestry.model.Stock;
import me.vestry.model.Transaction;
import me.vestry.model.User;
import me.vestry.repository.JournalEntryRepository;
import me.vestry.repository.TransactionRepository;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
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
    private final Clock clock;

    public ReflectionAidService(HindsightClient hindsight, JournalEntryRepository entries,
                                TransactionRepository transactions, StockService stocks, Clock clock) {
        this.hindsight = hindsight;
        this.entries = entries;
        this.transactions = transactions;
        this.stocks = stocks;
        this.clock = clock;
    }

    public enum Status { READY, LIMITED, NOT_FOUND, UNAVAILABLE, NOT_READY, DEMO_OWN_ENTRY }

    /** The facts are computed fresh on every call. Demo visitors never spend, so they get no remaining count. */
    public record Reflection(Status status, ReflectionAid aid, LocalDate generatedOn, Integer remainingToday, Since since) {
        static Reflection of(Status status, Since since) {
            return new Reflection(status, null, null, null, since);
        }
    }

    public boolean available() {
        return hindsight.isEnabled();
    }

    // no transaction: the model call can take tens of seconds and must not hold a database connection
    public Reflection reflect(User user, int entryId) {
        var entry = entries.findById(entryId).filter(e -> e.getUser().getId() == user.getId()).orElse(null);
        if (entry == null) return Reflection.of(Status.NOT_FOUND, null);
        var ledger = hasTicker(entry) ? transactions.findByUserIdAndTicker(user.getId(), entry.getTicker()) : List.<Transaction>of();
        var since = since(entry, ledger);
        var response = hindsight.reflectionAid(user.getId(), entryId, laterEntryIds(user, entry), since);
        return switch (response.status()) {
            case READY -> new Reflection(Status.READY, response.result().aid(), response.result().generatedOn(),
                    response.result().remainingToday(), since);
            case LIMITED -> Reflection.of(Status.LIMITED, since);
            case NOT_FOUND -> Reflection.of(Status.NOT_FOUND, since);
            case UNAVAILABLE -> Reflection.of(Status.UNAVAILABLE, since);
        };
    }

    /** Demo visitors only read the template account's saved aids, so they never cause a model call. */
    public Reflection reflectDemo(DemoSession session, User template, int entryId) {
        var entry = session.getJournalEntries().stream().filter(e -> e.getId() == entryId).findFirst().orElse(null);
        if (entry == null) return Reflection.of(Status.NOT_FOUND, null);
        // the visitor's own trades, so the numbers match the rest of their demo
        var ledger = hasTicker(entry) ? session.getTransactions().stream()
                .filter(t -> entry.getTicker().equals(t.getTicker())).toList() : List.<Transaction>of();
        var since = since(entry, ledger);
        Integer templateId = session.getTemplateEntryIds().get(entryId);
        if (templateId == null) return Reflection.of(Status.DEMO_OWN_ENTRY, since);
        var saved = hindsight.savedReflectionAids(template.getId(), List.of(templateId)).get(templateId);
        if (saved == null) return Reflection.of(Status.NOT_READY, since);
        return new Reflection(Status.READY, toCopyIds(saved.aid(), session), saved.generatedOn(), null, since);
    }

    /**
     * Nightly for the demo template: entries without an aid first, then the oldest, until hindsight's
     * daily limit or an outage stops it. Returns how many were refreshed.
     */
    public int refreshDemo(User template) {
        var today = LocalDate.now(clock.withZone(JournalEntryFilters.MARKET_ZONE));
        var candidates = entries.findByUserIdOrderByTimestampDesc(template.getId()).stream()
                .filter(e -> e.getBody() != null && !e.getBody().isBlank()).toList();
        var saved = hindsight.savedReflectionAids(template.getId(), candidates.stream().map(JournalEntry::getId).toList());
        var due = candidates.stream()
                .filter(e -> !saved.containsKey(e.getId()) || saved.get(e.getId()).generatedOn().isBefore(today))
                .sorted(Comparator.comparing((JournalEntry e) ->
                        saved.containsKey(e.getId()) ? saved.get(e.getId()).generatedOn() : LocalDate.MIN))
                .toList();
        int refreshed = 0;
        for (var entry : due) {
            var status = reflect(template, entry.getId()).status();
            if (status == Status.READY) refreshed++;
            else if (status != Status.NOT_FOUND) break;
        }
        return refreshed;
    }

    /** Same-ticker entries written after this one, plus reflections on it (which matter when it has no ticker). */
    List<Integer> laterEntryIds(User user, JournalEntry entry) {
        var sameTicker = hasTicker(entry) ? entries.findByUserIdAndTicker(user.getId(), entry.getTicker()) : List.<JournalEntry>of();
        return Stream.concat(sameTicker.stream(), entries.findByUserIdAndSourceEntryId(user.getId(), entry.getId()).stream())
                .filter(e -> e.getId() != entry.getId() && e.getTimestamp().isAfter(entry.getTimestamp()))
                .sorted(Comparator.comparing(JournalEntry::getTimestamp).reversed())
                .map(JournalEntry::getId).distinct().limit(MAX_LATER_ENTRIES).toList();
    }

    Since since(JournalEntry entry, List<Transaction> ledger) {
        if (!hasTicker(entry)) return new Since(null, null, List.of());
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

    // quotes cite template entries; the visitor's panel knows their copies
    private static ReflectionAid toCopyIds(ReflectionAid aid, DemoSession session) {
        var copies = session.copyIdsByTemplateId();
        var recap = aid.recap().stream().map(claim -> new Claim(claim.summary(), claim.citations().stream()
                .map(c -> new Citation(copies.getOrDefault(c.entryId(), c.entryId()), c.quote())).toList())).toList();
        return new ReflectionAid(recap, aid.questions());
    }

    private static boolean hasTicker(JournalEntry entry) {
        return entry.getTicker() != null && !entry.getTicker().isBlank();
    }
}
