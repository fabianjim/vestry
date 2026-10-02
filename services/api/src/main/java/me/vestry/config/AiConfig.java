package me.vestry.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.time.Clock;

@Configuration
public class AiConfig {
    @Bean
    public Clock aiClock() { return Clock.systemUTC(); }

    @Bean
    public AiLimits aiLimits(@Value("${vestry.ai.enabled:false}") boolean enabled,
                             @Value("${vestry.ai.lifetime-budget-micros:0}") long lifetime,
                             @Value("${vestry.ai.daily-budget-micros:200000}") long daily,
                             @Value("${vestry.ai.daily-generations:5}") int generations) {
        return new AiLimits(enabled, lifetime, daily, generations);
    }

    @Bean(defaultCandidate = false)
    public ThreadPoolTaskExecutor aiExecutor() {
        var executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(1);
        executor.setQueueCapacity(0);
        executor.setThreadNamePrefix("ai-generation-");
        return executor;
    }

    public record AiLimits(boolean enabled, long lifetimeMicros, long dailyMicros, int dailyGenerations) {
        public AiLimits {
            if (lifetimeMicros < 0 || dailyMicros < 0 || dailyGenerations < 0) {
                throw new IllegalArgumentException("AI limits cannot be negative");
            }
        }
    }
}
