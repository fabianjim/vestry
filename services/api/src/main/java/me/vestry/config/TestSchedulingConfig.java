package me.vestry.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Test configuration for scheduling
 * This allows you to test scheduled tasks in a test environment
 */
@Configuration
@EnableScheduling
@Profile("test-scheduling")
public class TestSchedulingConfig {
    // This configuration enables scheduling only when the test-scheduling profile is active
}

