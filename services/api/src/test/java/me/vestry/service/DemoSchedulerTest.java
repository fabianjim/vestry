package me.vestry.service;

import me.vestry.api.HindsightClient;
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

class DemoSchedulerTest {
    private final UserRepository users = mock(UserRepository.class);
    private final DashboardDigestService briefings = mock(DashboardDigestService.class);
    private final ReflectionAidService reflectionAids = mock(ReflectionAidService.class);
    private final InsightsService insights = mock(InsightsService.class);
    private final DemoScheduler scheduler = new DemoScheduler(users, briefings, reflectionAids, insights);

    private static User demo() {
        var demo = new User(); demo.setId(7); demo.setDemo(true);
        return demo;
    }

    @Test
    void runsAtTenNewYorkWeekdaysAcrossWeekendAndDaylightSavingChange() throws Exception {
        var schedule = DemoScheduler.class.getMethod("generateBriefings").getAnnotation(Scheduled.class);
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
        scheduler.generateBriefings();
        verifyNoInteractions(users);
        when(briefings.available()).thenReturn(true);
        var demo = demo();
        when(users.findByDemoTrue()).thenReturn(List.of(demo));
        scheduler.generateBriefings();
        verify(users).findByDemoTrue();
        verify(briefings).generateDemo(demo);
        verifyNoMoreInteractions(users);
    }

    @Test
    void refreshesReflectionAidsNightlyInNewYorkIncludingWeekends() throws Exception {
        var schedule = DemoScheduler.class.getMethod("refreshReflectionAids").getAnnotation(Scheduled.class);
        assertEquals("America/New_York", schedule.zone());
        var cron = CronExpression.parse(schedule.cron());
        var saturday = ZonedDateTime.of(2026, 10, 31, 3, 30, 0, 0, ZoneId.of(schedule.zone()));
        assertEquals(saturday, cron.next(saturday.minusSeconds(1)));
        // the night clocks fall back still runs once, at standard time
        assertEquals(ZonedDateTime.parse("2026-11-01T03:30:00-05:00[America/New_York]"), cron.next(saturday));
    }

    @Test
    void reflectionRefreshSkipsWhenHindsightIsOffAndSurvivesFailures() {
        scheduler.refreshReflectionAids();
        verifyNoInteractions(users);

        when(reflectionAids.available()).thenReturn(true);
        var demo = demo();
        when(users.findByDemoTrue()).thenReturn(List.of(demo, demo));
        when(reflectionAids.refreshDemo(demo)).thenThrow(new IllegalStateException("boom")).thenReturn(3);
        assertDoesNotThrow(scheduler::refreshReflectionAids);
        verify(reflectionAids, times(2)).refreshDemo(demo);
        verifyNoInteractions(briefings);
    }

    @Test
    void refreshesInsightsNightlyAfterTheReflectionAids() throws Exception {
        var schedule = DemoScheduler.class.getMethod("refreshInsights").getAnnotation(Scheduled.class);
        assertEquals("America/New_York", schedule.zone());
        var aids = CronExpression.parse(DemoScheduler.class.getMethod("refreshReflectionAids").getAnnotation(Scheduled.class).cron());
        var night = ZonedDateTime.of(2026, 10, 31, 0, 0, 0, 0, ZoneId.of(schedule.zone()));
        assertTrue(CronExpression.parse(schedule.cron()).next(night).isAfter(aids.next(night)));
    }

    @Test
    void insightsRefreshSkipsWhenHindsightIsOffAndSurvivesFailures() {
        scheduler.refreshInsights();
        verifyNoInteractions(users);

        when(insights.available()).thenReturn(true);
        var demo = demo();
        when(users.findByDemoTrue()).thenReturn(List.of(demo, demo, demo));
        when(insights.refreshDemo(demo)).thenThrow(new IllegalStateException("boom"))
                .thenReturn(new HindsightClient.ReportResponse(HindsightClient.ReportStatus.UNAVAILABLE, null))
                .thenReturn(new HindsightClient.ReportResponse(HindsightClient.ReportStatus.READY,
                        new HindsightClient.PatternReport(null, null, null, true, List.of(), List.of())));
        assertDoesNotThrow(scheduler::refreshInsights);
        verify(insights, times(3)).refreshDemo(demo);
    }
}
