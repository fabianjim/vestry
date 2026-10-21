package me.vestry.service;

import me.vestry.model.User;
import me.vestry.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.support.CronExpression;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DemoBriefingSchedulerTest {
    @Test
    void runsAtTenNewYorkWeekdaysAcrossWeekendAndDaylightSavingChange() throws Exception {
        var schedule = DemoBriefingScheduler.class.getMethod("generate").getAnnotation(Scheduled.class);
        assertEquals("America/New_York", schedule.zone());
        var cron = CronExpression.parse(schedule.cron());
        var friday = ZonedDateTime.of(2026, 10, 30, 10, 0, 0, 0, ZoneId.of(schedule.zone()));
        assertEquals(friday, cron.next(friday.minusSeconds(1)));
        // Retries every ten minutes through the hour, then waits for the next weekday.
        assertEquals(friday.plusMinutes(10), cron.next(friday));
        var monday = cron.next(friday.plusMinutes(50));
        assertEquals(ZonedDateTime.parse("2026-11-02T10:00:00-05:00[America/New_York]"), monday);
    }

    @Test
    void disabledAiDoesNotReadAccountsAndEnabledScheduleSelectsOnlyDemoAccounts() {
        var users = mock(UserRepository.class);
        var briefings = mock(DashboardDigestService.class);
        var scheduler = new DemoBriefingScheduler(users, briefings);
        scheduler.generate();
        verifyNoInteractions(users);
        when(briefings.available()).thenReturn(true);
        var demo = new User(); demo.setId(7); demo.setDemo(true);
        when(users.findByDemoTrue()).thenReturn(List.of(demo));
        scheduler.generate();
        verify(users).findByDemoTrue();
        verify(briefings).generateDemo(demo);
        verifyNoMoreInteractions(users);
    }
}
