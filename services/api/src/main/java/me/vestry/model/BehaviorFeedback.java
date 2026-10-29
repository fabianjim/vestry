package me.vestry.model;

import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** A user's current reaction to a behavior, given on the report of reportDay. */
public record BehaviorFeedback(BehaviorKey behavior, LocalDate reportDay, Reaction reaction, String note, Instant updatedAt)
        implements Serializable {
    public enum Reaction { FITS, DOESNT_FIT, KNEW }
}
