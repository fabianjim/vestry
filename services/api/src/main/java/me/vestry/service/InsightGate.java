package me.vestry.service;

import me.vestry.repository.UserRepository;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;

/**
 * Insights' generate gate: a new report needs a new New York day and a trade, entry or feedback changed since the
 * last one. Real users only; demo visitors never reach the database paths that record changes.
 */
@Component
public class InsightGate {
    public enum Blocked { UPDATED_TODAY, NOTHING_NEW, FAILED_TODAY }

    private final UserRepository users;
    private final Clock clock;

    public InsightGate(UserRepository users, Clock clock) {
        this.users = users;
        this.clock = clock;
    }

    /** Called wherever a report's inputs change: a trade recorded, an entry written, edited or deleted, a reaction saved. */
    public void inputsChanged(int userId) {
        users.markInsightInputsChanged(userId, clock.instant());
    }

    /**
     * Records that a new report was saved from facts read starting at {@code factsFrom}, so a change made while
     * it generated still counts as new.
     */
    public void reportSaved(int userId, Instant factsFrom) {
        users.markInsightReportFacts(userId, factsFrom);
    }

    /**
     * Why the user can't generate now, or null if they can.
     *
     * @param newestDay         the newest saved report's day, or null if there is none
     * @param newestGeneratedAt when the newest saved report was generated, or null if there is none
     * @param failedOn          the day of the user's last attempt if it failed, else null
     */
    public Blocked blocked(int userId, LocalDate newestDay, Instant newestGeneratedAt, LocalDate failedOn) {
        var times = users.findInsightGate(userId);
        return blocked(LocalDate.now(clock.withZone(JournalEntryFilters.MARKET_ZONE)), newestDay, newestGeneratedAt,
                times.map(UserRepository.InsightGateTimes::getInputsChangedAt).orElse(null),
                times.map(UserRepository.InsightGateTimes::getReportFactsAt).orElse(null), failedOn);
    }

    static Blocked blocked(LocalDate today, LocalDate newestDay, Instant newestGeneratedAt, Instant changedAt,
                           Instant factsAt, LocalDate failedOn) {
        // a failed attempt uses up its day
        if (today.equals(failedOn)) return Blocked.FAILED_TODAY;
        if (newestDay == null || newestGeneratedAt == null) return null;
        if (!newestDay.isBefore(today)) return Blocked.UPDATED_TODAY;
        // The report covers changes up to when its facts were read, not when hindsight saved it. A facts time left
        // from an older report is earlier still, which only errs toward letting the user generate.
        Instant covered = factsAt == null || factsAt.isAfter(newestGeneratedAt) ? newestGeneratedAt : factsAt;
        if (changedAt == null || !changedAt.isAfter(covered)) return Blocked.NOTHING_NEW;
        return null;
    }
}
