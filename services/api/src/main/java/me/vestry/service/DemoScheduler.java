package me.vestry.service;

import lombok.RequiredArgsConstructor;
import me.vestry.api.HindsightClient;
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
    private final InsightsService insights;

    // Retries within the hour after a budget refusal or outage. Hindsight keeps one attempt per day,
    // so a run after the briefing is saved returns it without a model call.
    @Scheduled(cron = "0 0/10 10 * * MON-FRI", zone = "America/New_York")
    public void generateBriefings() {
        if (!briefings.available()) return;
        for (var user : users.findByDemoTrue()) {
            try {
                var status = briefings.generateDemo(user);
                if (status != HindsightClient.BriefingStatus.READY) log.warn("Scheduled demo briefing: {}", status);
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

    // After the reflection aids. Hindsight keeps the first report of each New York day, so a rerun costs nothing.
    @Scheduled(cron = "0 45 3 * * *", zone = "America/New_York")
    public void generateInsights() {
        if (!insights.available()) return;
        for (var user : users.findByDemoTrue()) {
            try {
                var response = insights.generateDemo(user);
                if (response.status() == HindsightClient.ReportStatus.READY) {
                    log.info("Generated the demo behavior report: {} behaviors, {} still forming",
                            response.report().behaviors().size(), response.report().needs().size());
                } else {
                    log.warn("Scheduled demo behavior report could not be generated: {}", response.status());
                }
            } catch (RuntimeException failure) {
                log.warn("Scheduled demo behavior report could not be generated");
            }
        }
    }
}
