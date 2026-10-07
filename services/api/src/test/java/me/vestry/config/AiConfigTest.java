package me.vestry.config;

import me.vestry.config.AiConfig.AiLimits;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.junit.jupiter.api.Assertions.*;

class AiConfigTest {
    private final ApplicationContextRunner context = new ApplicationContextRunner()
            .withUserConfiguration(AiConfig.class);

    @Test
    void omittedLifetimeIsUncappedWhileAiRemainsOptInAndDailyLimitsRemain() {
        context.run(app -> {
            var limits = app.getBean(AiLimits.class);
            assertFalse(limits.enabled());
            assertEquals(-1, limits.lifetimeMicros());
            assertTrue(limits.permitsLifetimeSpend(1_000_000, 10_000));
            assertEquals(200_000, limits.dailyMicros());
            assertEquals(5, limits.dailyGenerations());
        });
    }

    @Test
    void usdBudgetsConvertExactlyAndTakePrecedenceOverLegacySettings() {
        context.withPropertyValues("vestry.ai.daily-budget-usd=0.20", "vestry.ai.lifetime-budget-usd=1.234567",
                "vestry.ai.daily-budget-micros=10", "vestry.ai.lifetime-budget-micros=20").run(app -> {
            var limits = app.getBean(AiLimits.class);
            assertEquals(200_000, limits.dailyMicros());
            assertEquals(1_234_567, limits.lifetimeMicros());
        });
        context.withPropertyValues("vestry.ai.daily-budget-usd=0", "vestry.ai.lifetime-budget-usd=-1").run(app -> {
            var limits = app.getBean(AiLimits.class);
            assertEquals(0, limits.dailyMicros());
            assertEquals(-1, limits.lifetimeMicros());
        });
        context.withPropertyValues("vestry.ai.lifetime-budget-usd=0").run(app ->
                assertFalse(app.getBean(AiLimits.class).permitsLifetimeSpend(0, 1)));
    }

    @Test
    void invalidUsdAmountsFailConfigurationInsteadOfRoundingOrDisablingTheCap() {
        for (String value : new String[]{"-0.000001", "-2", "0.0000001", "9223372036854.775808", "NaN", "abc"}) {
            for (String period : new String[]{"daily", "lifetime"}) {
                context.withPropertyValues("vestry.ai." + period + "-budget-usd=" + value)
                        .run(app -> assertNotNull(app.getStartupFailure(), period + " budget: " + value));
            }
        }
        context.withPropertyValues("vestry.ai.daily-budget-usd=-1")
                .run(app -> assertNotNull(app.getStartupFailure()));
    }

    @Test
    void environmentVariablesResolveThroughApplicationPropertiesWithLegacyFallback() throws java.io.IOException {
        var properties = new org.springframework.core.io.support.ResourcePropertySource("classpath:application.properties");
        var configured = context.withInitializer(app -> app.getEnvironment().getPropertySources().addLast(properties));
        configured.withPropertyValues("VESTRY_AI_DAILY_BUDGET_USD=0.25", "VESTRY_AI_LIFETIME_BUDGET_USD=2")
                .run(app -> {
                    var limits = app.getBean(AiLimits.class);
                    assertEquals(250_000, limits.dailyMicros());
                    assertEquals(2_000_000, limits.lifetimeMicros());
                });
        configured.withPropertyValues("VESTRY_AI_DAILY_BUDGET_MICROS=123456", "VESTRY_AI_LIFETIME_BUDGET_MICROS=654321")
                .run(app -> {
                    var limits = app.getBean(AiLimits.class);
                    assertEquals(123_456, limits.dailyMicros());
                    assertEquals(654_321, limits.lifetimeMicros());
                });
    }

    @Test
    void explicitLifetimeCapsIncludingZeroKeepTheirMeaning() {
        context.withPropertyValues("vestry.ai.lifetime-budget-micros=30000").run(app -> {
            var limits = app.getBean(AiLimits.class);
            assertTrue(limits.permitsLifetimeSpend(20_000, 10_000));
            assertFalse(limits.permitsLifetimeSpend(20_000, 10_001));
            assertFalse(limits.permitsLifetimeSpend(30_000, 1));
        });
        context.withPropertyValues("vestry.ai.lifetime-budget-micros=0").run(app ->
                assertFalse(app.getBean(AiLimits.class).permitsLifetimeSpend(0, 1)));
        assertThrows(IllegalArgumentException.class, () -> new AiLimits(true, -2, 200_000, 5));
        assertThrows(IllegalArgumentException.class, () -> new AiLimits(true, -1, -1, 5));
    }
}
