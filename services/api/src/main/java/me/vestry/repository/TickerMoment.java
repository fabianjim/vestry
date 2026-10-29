package me.vestry.repository;

import java.time.Instant;

/** A user's trade or entry, reduced to who, which ticker and when. */
public interface TickerMoment {
    int getUserId();
    String getTicker();
    Instant getTimestamp();
}
