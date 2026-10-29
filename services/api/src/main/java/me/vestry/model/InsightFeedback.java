package me.vestry.model;

import jakarta.persistence.*;

import java.time.Instant;
import java.time.LocalDate;

/** One current row per user and behavior; a new reaction replaces the old one. */
@Entity
@Table(name = "insight_feedback", uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "kind", "subject"}))
public class InsightFeedback {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private int id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 40)
    private String kind;

    /** Empty for kinds without a subject, so the unique constraint holds (Postgres treats nulls as distinct). */
    @Column(nullable = false, length = 40)
    private String subject;

    @Column(name = "report_day", nullable = false)
    private LocalDate reportDay;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private BehaviorFeedback.Reaction reaction;

    @Column(length = 1000)
    private String note;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected InsightFeedback() {}

    public InsightFeedback(User user, BehaviorKey behavior) {
        this.user = user;
        this.kind = behavior.kind();
        this.subject = behavior.subject() == null ? "" : behavior.subject();
    }

    public void update(BehaviorFeedback feedback) {
        this.reportDay = feedback.reportDay();
        this.reaction = feedback.reaction();
        this.note = feedback.note();
        this.updatedAt = feedback.updatedAt();
    }

    public BehaviorFeedback toFeedback() {
        return new BehaviorFeedback(new BehaviorKey(kind, subject.isEmpty() ? null : subject), reportDay, reaction, note, updatedAt);
    }
}
