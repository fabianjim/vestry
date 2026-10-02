package me.vestry.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Service;
import java.util.UUID;
import java.util.function.Consumer;

@Service
public class AiGenerationService {
    private static final Logger log = LoggerFactory.getLogger(AiGenerationService.class);
    private final AiBudgetService budget;
    private final ThreadPoolTaskExecutor executor;

    public AiGenerationService(AiBudgetService budget, @Qualifier("aiExecutor") ThreadPoolTaskExecutor executor) {
        this.budget = budget;
        this.executor = executor;
    }

    /** key is a server-built SHA-256 of account/session scope, context revision and request identity. */
    public UUID submit(String key, long allowanceMicros, Consumer<UUID> work) {
        var start = budget.start(key, allowanceMicros);
        if (!start.created()) return start.id();
        try {
            executor.execute(() -> {
                boolean success = false;
                try {
                    work.accept(start.id());
                    success = true;
                } catch (RuntimeException failure) {
                    log.warn("AI generation {} failed", start.id());
                } finally {
                    budget.finish(start.id(), success);
                }
            });
        } catch (RuntimeException rejected) {
            budget.finish(start.id(), false);
            throw new IllegalStateException("AI generation is unavailable");
        }
        return start.id();
    }
}
