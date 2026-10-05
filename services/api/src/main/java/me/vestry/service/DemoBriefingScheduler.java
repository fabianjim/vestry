package me.vestry.service;

import lombok.RequiredArgsConstructor;
import me.vestry.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class DemoBriefingScheduler {
    private static final Logger log = LoggerFactory.getLogger(DemoBriefingScheduler.class);
    private final UserRepository users;
    private final DashboardDigestService briefings;

    @Scheduled(cron = "0 0 10 * * MON-FRI", zone = "America/New_York")
    public void generate() {
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
}
