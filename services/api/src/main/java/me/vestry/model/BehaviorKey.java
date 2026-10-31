package me.vestry.model;

import java.io.Serializable;
import java.util.regex.Pattern;

/** A behavior's identity in hindsight's catalog: its kind and, for some kinds, a subject (e.g. emotional:anxious). */
public record BehaviorKey(String kind, String subject) implements Serializable {
    private static final Pattern NAME = Pattern.compile("[a-z][a-z_]{0,39}");

    public BehaviorKey {
        if (kind == null || !NAME.matcher(kind).matches()) throw new IllegalArgumentException("Unknown behavior");
        if (subject != null && !NAME.matcher(subject).matches()) throw new IllegalArgumentException("Unknown behavior");
    }

    /** "kind" or "kind:subject", as stored on an entry written about the behavior. */
    public static BehaviorKey parse(String value) {
        if (value == null) throw new IllegalArgumentException("Unknown behavior");
        int colon = value.indexOf(':');
        return colon < 0 ? new BehaviorKey(value, null) : new BehaviorKey(value.substring(0, colon), value.substring(colon + 1));
    }

    @Override
    public String toString() {
        return subject == null ? kind : kind + ":" + subject;
    }
}
