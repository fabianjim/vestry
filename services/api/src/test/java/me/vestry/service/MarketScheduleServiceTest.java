package me.vestry.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Instant;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

class MarketScheduleServiceTest {
    private final MarketScheduleService schedule = new MarketScheduleService("");

    @ParameterizedTest
    @ValueSource(strings = {
        "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
        "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
        "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
        "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
        "2028-01-17", "2028-02-21", "2028-04-14", "2028-05-29", "2028-06-19",
        "2028-07-04", "2028-09-04", "2028-11-23", "2028-12-25",
        "2026-09-05", "2026-09-06", "2023-01-02"
    })
    void exchangeClosuresAreNotTradingDays(String date) {
        assertFalse(schedule.isTradingDay(LocalDate.parse(date)));
    }

    @ParameterizedTest
    @ValueSource(strings = {"2027-12-31", "2026-10-12", "2026-11-11", "2026-11-27", "2026-12-24"})
    void bankHolidaysAndEarlyCloseSessionsRemainTradingDays(String date) {
        assertTrue(schedule.isTradingDay(LocalDate.parse(date)));
    }

    @ParameterizedTest
    @CsvSource({
        "2026-06-10T15:15:00Z, 2026-06-10T16:00:00Z",
        "2026-06-10T20:00:00Z, 2026-06-10T20:30:00Z",
        "2026-06-10T20:29:59Z, 2026-06-10T20:30:00Z",
        "2026-06-10T20:30:00Z, 2026-06-11T14:00:00Z",
        "2026-06-10T12:00:00Z, 2026-06-10T14:00:00Z",
        "2026-06-10T14:00:00Z, 2026-06-10T15:00:00Z",
        "2026-06-13T15:00:00Z, 2026-06-15T14:00:00Z",
        "2026-06-14T18:00:00Z, 2026-06-15T14:00:00Z",
        "2026-09-04T20:30:00Z, 2026-09-08T14:00:00Z",
        "2026-09-07T04:00:00Z, 2026-09-08T14:00:00Z",
        "2026-09-07T18:00:00Z, 2026-09-08T14:00:00Z",
        "2026-04-02T20:30:00Z, 2026-04-06T14:00:00Z",
        "2026-12-31T21:30:00Z, 2027-01-04T15:00:00Z",
        "2026-03-06T21:30:00Z, 2026-03-09T14:00:00Z",
        "2026-10-30T20:30:00Z, 2026-11-02T15:00:00Z",
        "2026-11-27T18:00:00Z, 2026-11-27T19:00:00Z"
    })
    void nextUpdateFollowsTradingCalendarAndEasternTime(String now, String expected) {
        assertEquals(Instant.parse(expected), schedule.nextUpdate(Instant.parse(now)));
    }

    @Test
    void extraordinaryClosuresApplyToScheduleAndFreshness() {
        MarketScheduleService custom = new MarketScheduleService("2026-09-08, 2026-09-09");
        assertEquals(Instant.parse("2026-09-10T14:00:00Z"), custom.nextUpdate(Instant.parse("2026-09-07T12:00:00Z")));
        assertTrue(custom.isCurrentEod(LocalDate.parse("2026-09-04"), Instant.parse("2026-09-09T18:00:00Z")));
    }

    @Test
    void midweekHolidayKeepsLatestEodAndRejectsOlderOrFutureData() {
        Instant thanksgiving = Instant.parse("2026-11-26T18:00:00Z");
        assertTrue(schedule.isCurrentEod(LocalDate.parse("2026-11-25"), thanksgiving));
        assertFalse(schedule.isCurrentEod(LocalDate.parse("2026-11-24"), thanksgiving));
        assertFalse(schedule.isCurrentEod(LocalDate.parse("2026-11-27"), thanksgiving));
        assertFalse(schedule.isCurrentEod(LocalDate.parse("2026-11-26"), thanksgiving));
    }
}
