package me.vestry.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration
public class BriefingConfig {
    /** Hindsight writes the briefing after vestry's POST answers, so the user can leave the page. */
    @Bean(defaultCandidate = false)
    public ThreadPoolTaskExecutor briefingExecutor() {
        var executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(2);
        executor.setQueueCapacity(20);
        executor.setThreadNamePrefix("briefing-");
        return executor;
    }
}
