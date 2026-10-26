package me.vestry.service;

import lombok.RequiredArgsConstructor;
import me.vestry.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** Generated content for the demo account, which visitors only ever read. */
@Service
@RequiredArgsConstructor
public class DemoScheduler {
    private static final Logger log = LoggerFactory.getLogger(DemoScheduler.class);
    private final UserRepository users;
    private final DashboardDigestService briefings;
    private final ReflectionAidService reflectionAids;

    // Retries within the hour: a user briefing running at 10:00 would otherwise skip the day.
    // generateDemo starts at most one job per day.
    @Scheduled(cron = "0 0/10 10 * * MON-FRI", zone = "America/New_York")
    public void generateBriefings() {
        if (!briefings.available()) return;
        for (var user : users.findByDemoTrue()) {
            try {
                briefings.generateDemo(user);
            } catch (RuntimeException failure) {
                // Do not log private context, provider output, or credentials.
                log.warn("Scheduled demo briefing could not be started");
            }
        }
    }

    // Overnight and every day, away from the 10:00 briefing; hindsight's daily limit caps each run.
    @Scheduled(cron = "0 30 3 * * *", zone = "America/New_York")
    public void refreshReflectionAids() {
        if (!reflectionAids.available()) return;
        for (var user : users.findByDemoTrue()) {
            try {
                log.info("Refreshed {} demo reflection aids", reflectionAids.refreshDemo(user));
            } catch (RuntimeException failure) {
                log.warn("Scheduled demo reflection aids could not be refreshed");
            }
        }
    }
}
