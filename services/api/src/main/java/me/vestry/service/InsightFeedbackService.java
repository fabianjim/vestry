package me.vestry.service;

import me.vestry.model.BehaviorFeedback;
import me.vestry.model.BehaviorKey;
import me.vestry.model.DemoSession;
import me.vestry.model.InsightFeedback;
import me.vestry.model.User;
import me.vestry.repository.InsightFeedbackRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;

/** Reactions to behaviors. Hindsight gets the current one per behavior with every report request. */
@Service
public class InsightFeedbackService {
    /** Hindsight's contract caps the feedback list. */
    static final int MAX_FEEDBACK = 200;
    static final int MAX_NOTE = 1000;

    private final InsightFeedbackRepository repository;
    private final Clock clock;

    public InsightFeedbackService(InsightFeedbackRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    public BehaviorFeedback save(User user, BehaviorKey behavior, LocalDate reportDay, BehaviorFeedback.Reaction reaction, String note) {
        var feedback = feedback(behavior, reportDay, reaction, note);
        try {
            return upsert(user, feedback);
        } catch (DataIntegrityViolationException e) {
            // a concurrent first reaction to the same behavior inserted the row; replace it instead
            return upsert(user, feedback);
        }
    }

    /** Newest first, at most MAX_FEEDBACK. */
    public List<BehaviorFeedback> list(User user) {
        return repository.findTop200ByUserIdOrderByUpdatedAtDescIdDesc(user.getId()).stream()
                .map(InsightFeedback::toFeedback).toList();
    }

    /** A demo visitor's reactions live in their session only and never touch the template account. */
    public BehaviorFeedback saveDemo(DemoSession session, BehaviorKey behavior, LocalDate reportDay,
                                     BehaviorFeedback.Reaction reaction, String note) {
        var feedback = feedback(behavior, reportDay, reaction, note);
        synchronized (session) {
            session.getInsightFeedback().put(behavior, feedback);
        }
        return feedback;
    }

    public List<BehaviorFeedback> listDemo(DemoSession session) {
        synchronized (session) {
            return session.getInsightFeedback().values().stream()
                    .sorted(Comparator.comparing(BehaviorFeedback::updatedAt).reversed())
                    .limit(MAX_FEEDBACK).toList();
        }
    }

    private BehaviorFeedback upsert(User user, BehaviorFeedback feedback) {
        var behavior = feedback.behavior();
        var row = repository.findByUserIdAndKindAndSubject(user.getId(), behavior.kind(),
                        behavior.subject() == null ? "" : behavior.subject())
                .orElseGet(() -> new InsightFeedback(user, behavior));
        row.update(feedback);
        return repository.save(row).toFeedback();
    }

    private BehaviorFeedback feedback(BehaviorKey behavior, LocalDate reportDay, BehaviorFeedback.Reaction reaction, String note) {
        if (behavior == null || reportDay == null || reaction == null) {
            throw new IllegalArgumentException("Feedback needs a behavior, a report and a reaction");
        }
        String trimmed = note == null || note.isBlank() ? null : note.strip();
        if (trimmed != null && trimmed.length() > MAX_NOTE) {
            throw new IllegalArgumentException("A note can be at most " + MAX_NOTE + " characters");
        }
        return new BehaviorFeedback(behavior, reportDay, reaction, trimmed, clock.instant());
    }
}
