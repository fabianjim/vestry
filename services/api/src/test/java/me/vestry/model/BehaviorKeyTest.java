package me.vestry.model;

import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.*;

class BehaviorKeyTest {

    @Test
    void parsesKindAndOptionalSubjectAndRoundTrips() {
        BehaviorKey fomo = BehaviorKey.parse("fomo");
        assertEquals("fomo", fomo.kind());
        assertNull(fomo.subject());
        assertEquals("fomo", fomo.toString());

        BehaviorKey anxious = BehaviorKey.parse("emotional:anxious");
        assertEquals("emotional", anxious.kind());
        assertEquals("anxious", anxious.subject());
        assertEquals("emotional:anxious", anxious.toString());
    }

    @Test
    void rejectsMalformedKeys() {
        String longKind = "a".repeat(41);
        for (String value : Arrays.asList(null, "", "Fomo", "emotional:", ":anxious", "a:b:c", "run up", longKind)) {
            assertThrows(IllegalArgumentException.class, () -> BehaviorKey.parse(value), String.valueOf(value));
        }
    }
}
