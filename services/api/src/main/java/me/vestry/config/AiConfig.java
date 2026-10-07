package me.vestry.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.time.Clock;
import java.math.BigDecimal;

@Configuration
public class AiConfig {
    @Bean
    public Clock aiClock() { return Clock.systemUTC(); }

    @Bean
    public AiLimits aiLimits(@Value("${vestry.ai.enabled:false}") boolean enabled,
                             @Value("${vestry.ai.lifetime-budget-usd:}") String lifetimeUsd,
                             @Value("${vestry.ai.daily-budget-usd:}") String dailyUsd,
                             @Value("${vestry.ai.lifetime-budget-micros:-1}") long lifetime,
                             @Value("${vestry.ai.daily-budget-micros:200000}") long daily,
                             @Value("${vestry.ai.daily-generations:5}") int generations) {
        return new AiLimits(enabled, budgetMicros(lifetimeUsd, lifetime, true),
                budgetMicros(dailyUsd, daily, false), generations);
    }

    /** USD settings take precedence; legacy microdollar settings remain valid for existing deployments. */
    private static long budgetMicros(String usd, long legacyMicros, boolean lifetime) {
        if (usd.isBlank()) return legacyMicros;
        try {
            var amount = new BigDecimal(usd.strip());
            if (lifetime && amount.compareTo(BigDecimal.ONE.negate()) == 0) return -1;
            if (amount.signum() < 0) throw new IllegalArgumentException("Budget must be nonnegative");
            return amount.movePointRight(6).longValueExact();
        } catch (IllegalArgumentException | ArithmeticException invalid) {
            throw new IllegalArgumentException((lifetime ? "Lifetime" : "Daily")
                    + " USD budget must be nonnegative, fit in microdollars, and have at most six decimal places"
                    + (lifetime ? "; -1 means uncapped" : ""), invalid);
        }
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
            if (lifetimeMicros < -1 || dailyMicros < 0 || dailyGenerations < 0) {
                throw new IllegalArgumentException("Only the lifetime limit accepts -1 (uncapped)");
            }
        }

        public boolean permitsLifetimeSpend(long charged, long additional) {
            return lifetimeMicros == -1 || additional <= lifetimeMicros - charged;
        }
    }
}
