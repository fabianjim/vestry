package me.vestry.config;

import me.vestry.service.BriefingTracing;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class LangfuseConfig {
    @Bean(destroyMethod = "close")
    public BriefingTracing briefingTracing(
            @Value("${vestry.langfuse.enabled:false}") boolean enabled,
            @Value("${vestry.langfuse.base-url:}") String baseUrl,
            @Value("${vestry.langfuse.public-key:}") String publicKey,
            @Value("${vestry.langfuse.secret-key:}") String secretKey,
            @Value("${vestry.langfuse.environment:development}") String environment,
            @Value("${vestry.langfuse.release:}") String release) {
        return BriefingTracing.create(enabled, baseUrl, publicKey, secretKey, environment, release, false);
    }
}
