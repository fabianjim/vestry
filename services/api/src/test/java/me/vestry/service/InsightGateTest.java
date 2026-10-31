package me.vestry.service;

import me.vestry.repository.UserRepository;
import me.vestry.service.InsightGate.Blocked;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class InsightGateTest {
    private static final LocalDate TODAY = LocalDate.parse("2026-10-28");

    // an empty cell is null; an empty expected cell means the user may generate
    @ParameterizedTest(name = "{6}")
    @CsvSource(delimiter = '|', textBlock = """
        2026-10-28 | 2026-10-28 | 2026-10-28T15:00:00Z | 2026-10-28T16:00:00Z |                      | FAILED_TODAY  | a failure today blocks even with a report
        2026-10-28 |            |                      |                      |                      | FAILED_TODAY  | a failure today blocks a first report
                   |            |                      |                      |                      |               | no report and no changes is allowed
                   | 2026-10-27 |                      |                      |                      |               | a report without a generation time counts as none
                   | 2026-10-28 | 2026-10-28T15:00:00Z | 2026-10-28T16:00:00Z |                      | UPDATED_TODAY | a report today blocks despite later changes
                   | 2026-10-29 | 2026-10-29T15:00:00Z | 2026-10-29T16:00:00Z |                      | UPDATED_TODAY | a report dated after today also blocks
                   | 2026-10-27 | 2026-10-27T15:00:00Z |                      |                      | NOTHING_NEW   | nothing ever changed
                   | 2026-10-27 | 2026-10-27T15:00:00Z | 2026-10-27T14:00:00Z |                      | NOTHING_NEW   | changed only before the report
                   | 2026-10-27 | 2026-10-27T15:00:00Z | 2026-10-27T15:00:00Z |                      | NOTHING_NEW   | a change at the report's instant is not after it
                   | 2026-10-27 | 2026-10-27T15:00:00Z | 2026-10-27T15:00:01Z |                      |               | changed after an earlier day's report
        2026-10-27 | 2026-10-27 | 2026-10-27T15:00:00Z | 2026-10-27T16:00:00Z |                      |               | an earlier day's failure doesn't block
                   | 2026-10-27 | 2026-10-27T15:00:00Z | 2026-10-27T14:59:30Z | 2026-10-27T14:59:00Z |               | a change while the report generated is new
                   | 2026-10-27 | 2026-10-27T15:00:00Z | 2026-10-27T14:58:00Z | 2026-10-27T14:59:00Z | NOTHING_NEW   | changed only before the report's facts were read
                   | 2026-10-27 | 2026-10-27T15:00:00Z | 2026-10-27T14:59:00Z | 2026-10-27T14:59:00Z | NOTHING_NEW   | a change at the facts' instant is not after it
                   | 2026-10-27 | 2026-10-27T15:00:00Z | 2026-10-27T15:30:00Z | 2026-10-27T16:00:00Z |               | a facts time after the report is ignored
        """)
    void blocked(LocalDate failedOn, LocalDate newestDay, Instant newestGeneratedAt, Instant changedAt, Instant factsAt,
                 Blocked expected, String rule) {
        assertEquals(expected, InsightGate.blocked(TODAY, newestDay, newestGeneratedAt, changedAt, factsAt, failedOn));
    }

    @Test
    void todayIsTheNewYorkDate() {
        UserRepository users = mock(UserRepository.class);
        when(users.findInsightGate(1)).thenReturn(Optional.empty());
        // 2026-10-29 in UTC, still 2026-10-28 in New York
        var gate = new InsightGate(users, Clock.fixed(Instant.parse("2026-10-29T02:00:00Z"), ZoneOffset.UTC));

        assertEquals(Blocked.UPDATED_TODAY,
                gate.blocked(1, LocalDate.parse("2026-10-28"), Instant.parse("2026-10-28T20:00:00Z"), null));
    }

    @Test
    void reportSavedMarksWhenItsFactsWereRead() {
        UserRepository users = mock(UserRepository.class);
        Instant factsFrom = Instant.parse("2026-10-28T14:59:00Z");

        new InsightGate(users, Clock.systemUTC()).reportSaved(7, factsFrom);

        verify(users).markInsightReportFacts(7, factsFrom);
    }
}
