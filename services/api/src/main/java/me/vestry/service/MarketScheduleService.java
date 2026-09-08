package me.vestry.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.*;
import java.time.temporal.TemporalAdjusters;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * US equity full-day closures, following https://www.nyse.com/markets/hours-calendars.
 * Early-close sessions retain Vestry's 10–16 hourly and 16:30 EOD fetch schedule.
 * Extraordinary closures can be supplied as comma-separated ISO dates via
 * vestry.market.additional-closures without changing the recurring holiday rules.
 */
@Service
public class MarketScheduleService {
    public static final ZoneId MARKET_ZONE = ZoneId.of("America/New_York");
    public static final String INTRADAY_CRON = "0 0 10-16 * * MON-FRI";
    public static final String EOD_CRON = "0 30 16 * * MON-FRI";
    private final Set<LocalDate> additionalClosures;

    public MarketScheduleService(@Value("${vestry.market.additional-closures:}") String additionalClosures) {
        this.additionalClosures = Arrays.stream(additionalClosures.split(","))
                .map(String::trim).filter(s -> !s.isEmpty()).map(LocalDate::parse).collect(Collectors.toSet());
    }

    public boolean isTradingDayToday() {
        return isTradingDay(LocalDate.now(MARKET_ZONE));
    }

    public boolean isTradingDay(LocalDate date) {
        if (date.getDayOfWeek() == DayOfWeek.SATURDAY || date.getDayOfWeek() == DayOfWeek.SUNDAY
                || additionalClosures.contains(date)) return false;
        int year = date.getYear();
        LocalDate newYear = LocalDate.of(year, 1, 1);
        // NYSE does not observe Saturday New Year's Day on the preceding Friday.
        if (newYear.getDayOfWeek() == DayOfWeek.SUNDAY) newYear = newYear.plusDays(1);
        return !date.equals(newYear)
                && !date.equals(nthWeekday(year, 1, DayOfWeek.MONDAY, 3))
                && !date.equals(nthWeekday(year, 2, DayOfWeek.MONDAY, 3))
                && !date.equals(easterSunday(year).minusDays(2))
                && !date.equals(LocalDate.of(year, 5, 31).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)))
                && !(year >= 2022 && date.equals(observed(LocalDate.of(year, 6, 19))))
                && !date.equals(observed(LocalDate.of(year, 7, 4)))
                && !date.equals(nthWeekday(year, 9, DayOfWeek.MONDAY, 1))
                && !date.equals(nthWeekday(year, 11, DayOfWeek.THURSDAY, 4))
                && !date.equals(observed(LocalDate.of(year, 12, 25)));
    }

    public Instant nextUpdate(Instant now) {
        ZonedDateTime marketNow = now.atZone(MARKET_ZONE);
        LocalDate date = marketNow.toLocalDate();
        while (true) {
            if (isTradingDay(date)) {
                for (int hour = 10; hour <= 16; hour++) {
                    Instant candidate = date.atTime(hour, 0).atZone(MARKET_ZONE).toInstant();
                    if (candidate.isAfter(now)) return candidate;
                }
                Instant eod = date.atTime(16, 30).atZone(MARKET_ZONE).toInstant();
                if (eod.isAfter(now)) return eod;
            }
            date = date.plusDays(1);
        }
    }

    public boolean isCurrentEod(LocalDate observationDate, Instant now) {
        ZonedDateTime marketNow = now.atZone(MARKET_ZONE);
        LocalDate today = marketNow.toLocalDate();
        if (!isTradingDay(observationDate) || observationDate.isAfter(today)) return false;
        if (observationDate.equals(today)) return true;
        if (isTradingDay(today) && marketNow.getHour() >= 10) return false;
        LocalDate previous = today.minusDays(1);
        while (!isTradingDay(previous)) previous = previous.minusDays(1);
        return observationDate.equals(previous);
    }

    private LocalDate nthWeekday(int year, int month, DayOfWeek weekday, int occurrence) {
        return LocalDate.of(year, month, 1).with(TemporalAdjusters.dayOfWeekInMonth(occurrence, weekday));
    }

    private LocalDate observed(LocalDate date) {
        return switch (date.getDayOfWeek()) {
            case SATURDAY -> date.minusDays(1);
            case SUNDAY -> date.plusDays(1);
            default -> date;
        };
    }

    // Gregorian computus (Meeus/Jones/Butcher); Good Friday is two days earlier.
    private LocalDate easterSunday(int year) {
        int a = year % 19, b = year / 100, c = year % 100;
        int d = b / 4, e = b % 4, f = (b + 8) / 25, g = (b - f + 1) / 3;
        int h = (19 * a + b - d - g + 15) % 30;
        int i = c / 4, k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
        int m = (a + 11 * h + 22 * l) / 451;
        int value = h + l - 7 * m + 114;
        return LocalDate.of(year, value / 31, value % 31 + 1);
    }
}
