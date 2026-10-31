package me.vestry.model;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Locale;

/**
 * The price change over the 20 trading days before a New York day, for a ticker bought that day.
 * It's a market fact, so every buy of the ticker that day shares one row, and one Tiingo request.
 * A missing row means it hasn't been fetched yet.
 */
@Entity
@Table(name = "run_ups")
public class RunUp {
    private static final ZoneId MARKET_ZONE = ZoneId.of("America/New_York");

    public enum Status { PENDING, KNOWN, UNAVAILABLE }

    @Embeddable
    public record Key(@Column(nullable = false) String ticker,
                      @Column(name = "buy_day", nullable = false) LocalDate buyDay) implements Serializable {
        public static Key of(String ticker, Instant boughtAt) {
            return new Key(ticker.toUpperCase(Locale.ROOT), boughtAt.atZone(MARKET_ZONE).toLocalDate());
        }
    }

    @EmbeddedId
    private Key key;

    /** Stored rows are KNOWN or UNAVAILABLE; PENDING is never saved. */
    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private Status status;

    /** A fraction (0.142 = 14.2%), present only when KNOWN. */
    @Column(name = "run_up")
    private Double value;

    @Column(name = "fetched_at", nullable = false)
    private Instant fetchedAt;

    protected RunUp() {}

    private RunUp(Key key, Status status, Double value, Instant fetchedAt) {
        this.key = key;
        this.status = status;
        this.value = value;
        this.fetchedAt = fetchedAt;
    }

    public static RunUp known(Key key, double value, Instant fetchedAt) {
        return new RunUp(key, Status.KNOWN, value, fetchedAt);
    }

    public static RunUp unavailable(Key key, Instant fetchedAt) {
        return new RunUp(key, Status.UNAVAILABLE, null, fetchedAt);
    }

    public Key getKey() { return key; }
    public Status getStatus() { return status; }
    public Double getValue() { return value; }
    public Instant getFetchedAt() { return fetchedAt; }
}
