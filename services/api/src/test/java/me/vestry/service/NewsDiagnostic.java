package me.vestry.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import me.vestry.api.OpenAiClient;
import me.vestry.config.AiConfig;
import me.vestry.dto.NewsBriefing;
import me.vestry.model.NewsCache;
import me.vestry.model.PortfolioDigest;
import me.vestry.repository.PortfolioDigestRepository;
import java.time.Clock;
import me.vestry.repository.NewsCacheRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.client.BufferingClientHttpRequestFactory;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/** Manual only: excluded by Surefire's normal naming rules AND requires an explicit opt-in. */
@EnabledIfSystemProperty(named = "vestry.ai.diagnostic", matches = "true")
@DataJpaTest(showSql = false, properties = {
        "spring.datasource.url=${VESTRY_AI_DIAGNOSTIC_DB_URL}",
        "spring.datasource.username=${VESTRY_AI_DIAGNOSTIC_DB_USERNAME}",
        "spring.datasource.password=${VESTRY_AI_DIAGNOSTIC_DB_PASSWORD}",
        "spring.datasource.driver-class-name=org.postgresql.Driver",
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.sql.init.mode=never"
})
@ActiveProfiles("ai-diagnostic")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({AiConfig.class, AiBudgetService.class, OpenAiClient.class, NewsService.class, DigestService.class, NewsDiagnostic.Config.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class NewsDiagnostic {
    @TestConfiguration
    static class Config {
        @Bean ObjectMapper mapper() { return new ObjectMapper().findAndRegisterModules(); }
    }

    @Autowired AiBudgetService budget;
    @Autowired OpenAiClient client;
    @Autowired NewsService news;
    @Autowired DigestService digests;
    @Autowired Clock clock;
    @Autowired ObjectMapper mapper;
    @MockitoBean PortfolioDigestRepository savedDigests;
    @MockitoBean DemoSessionResolver users;
    // Exercise the real news path without reading, clearing or overwriting the dashboard cache.
    @MockitoBean NewsCacheRepository cache;

    @Test
    void fetchNewsOnce() throws Exception {
        String mode = System.getProperty("vestry.ai.diagnostic.mode", "news");
        assertTrue(mode.equals("news") || mode.equals("briefing"), "Diagnostic mode must be news or briefing");
        boolean fullBriefing = mode.equals("briefing");
        assertTrue(client.isConfigured(), "Configure OPENAI_API_KEY and the existing VESTRY_AI_* limits first");
        when(cache.saveAndFlush(any(NewsCache.class))).thenAnswer(call -> {
            NewsCache entry = call.getArgument(0);
            if (entry.getStatus() != NewsBriefing.Status.FETCHING) {
                System.out.printf("AI diagnostic news: status=%s, sources=%d%n",
                        entry.getStatus(), entry.getItems() == null ? 0 : entry.getItems().path("items").size());
            }
            if (entry.getStatus() == NewsBriefing.Status.READY) {
                System.out.println("\nPublic news research (model output, not independently verified):");
                System.out.println(entry.getItems().path("research").asText());
            }
            return entry;
        });
        when(savedDigests.saveAndFlush(any(PortfolioDigest.class))).thenAnswer(call -> call.getArgument(0));
        var http = (RestTemplate) ReflectionTestUtils.getField(client, "http");
        assertNotNull(http);
        http.setRequestFactory(new BufferingClientHttpRequestFactory(http.getRequestFactory()));
        http.getInterceptors().add((request, body, execution) -> {
            var response = execution.execute(request, body);
            System.out.println("News diagnostic HTTP status: " + response.getStatusCode().value());
            if (response.getStatusCode().is2xxSuccessful()) {
                try {
                    var json = new ObjectMapper().readTree(response.getBody());
                    long searches = 0, sources = 0;
                    for (var item : json.path("output")) {
                        if ("web_search_call".equals(item.path("type").asText())) {
                            searches++;
                            sources += item.path("action").path("sources").size();
                        }
                    }
                    System.out.printf("AI diagnostic: searches=%d, searchSources=%d%n", searches, sources);
                    System.out.printf("AI diagnostic: completed=%s, outputTokenLimit=%s, inputTokens=%d, outputTokens=%d%n",
                            "completed".equals(json.path("status").asText()),
                            "max_output_tokens".equals(json.path("incomplete_details").path("reason").asText()),
                            json.path("usage").path("input_tokens").asLong(-1),
                            json.path("usage").path("output_tokens").asLong(-1));
                } catch (Exception invalid) {
                    System.out.println("News diagnostic: unreadable response JSON");
                }
            }
            return response;
        });
        var tickers = List.of("AAPL", "SNOW");
        // Synthetic context only: dates move with the run so this exercises recent activity and continuity.
        // No real portfolio, journal, or authenticated account is loaded.
        var now = clock.instant();
        var yesterday = now.minus(java.time.Duration.ofDays(1));
        var context = mapper.createObjectNode().put("capturedAt", now.toString())
                .put("activitySinceExclusive", yesterday.toString()).put("activityThroughInclusive", now.toString())
                .put("activityIsRecentSample", true).put("journalIsRecentSample", true).put("journalEntriesIncluded", 1);
        context.putArray("holdings").addObject().put("ticker", "AAPL").put("shares", 2);
        ((com.fasterxml.jackson.databind.node.ArrayNode) context.path("holdings"))
                .addObject().put("ticker", "SNOW").put("shares", 3);
        context.putArray("recentTransactions").addObject().put("ticker", "SNOW").put("type", "SELL")
                .put("shares", 1).put("price", 180).put("timestamp", now.minusSeconds(7200).toString());
        context.putArray("journal").addObject().put("ticker", "SNOW").put("type", "INSIGHT")
                .put("timestamp", now.minusSeconds(3600).toString()).put("newSincePreviousBriefing", true)
                .put("body", "After trimming Snowflake, I want to revisit whether my original reason for the remaining position still holds.");
        context.putArray("previousCoverage").addObject().put("capturedAt", yesterday.toString())
                .put("nextStep", "Revisit your reasoning in the journal").putArray("sourceUrls");
        var snapshot = new DigestContextService.Snapshot(0, true, now, tickers, context.toString());
        long allowance = fullBriefing ? digests.allowance(snapshot) : news.allowance(tickers);
        long ceiling = fullBriefing ? 30_000 : 20_000;
        assertTrue(allowance <= ceiling, "Diagnostic exceeds its reservation ceiling; no request made");
        String key = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(("news-diagnostic:" + UUID.randomUUID()).getBytes(StandardCharsets.UTF_8)));
        var job = budget.start(key, allowance);
        assertTrue(job.created(), "Diagnostic job was already attempted");
        boolean success = false;
        try {
            NewsBriefing.Status status;
            int stories;
            if (fullBriefing) {
                var result = digests.generate(job.id(), snapshot);
                status = result.content().newsStatus();
                stories = result.content().sources().size();
                System.out.printf("AI diagnostic: validatedBriefing=true, questions=%d%n", result.content().questions().size());
                // This diagnostic uses synthetic context only; never add this output to production logging.
                var content = result.content();
                var displayedText = new StringBuilder();
                System.out.println("\nGenerated briefing (synthetic portfolio):");
                for (String paragraph : List.of(content.news(), content.reflection())) {
                    if (!paragraph.isBlank()) {
                        System.out.println(paragraph + "\n");
                        displayedText.append(paragraph).append(' ');
                    }
                }
                for (var action : content.questions()) {
                    System.out.printf("%s → %s%n", action.text(), action.destination());
                    displayedText.append(action.text()).append(' ');
                }
                String text = displayedText.toString().strip();
                int wordCount = text.isEmpty() ? 0 : text.split("(?U)\\s+").length;
                System.out.printf("Word count: %d / 120 (includes next-step text and news status; excludes source labels and destinations)%n", wordCount);
                for (var source : content.sources()) {
                    System.out.printf("Source: %s — %s%n", source.headline(), source.url());
                }
                System.out.println();
            } else {
                var result = news.getOrFetch(job.id(), tickers);
                status = result.status();
                stories = result.items().size();
            }
            success = status == NewsBriefing.Status.READY || status == NewsBriefing.Status.EMPTY;
            System.out.printf("AI diagnostic mode=%s generation=%s status=%s citedOrAvailableSources=%d reservedMicros=%d%n",
                    mode, job.id(), status, stories, allowance);
            assertTrue(success, "News failed; inspect the AI news generation diagnostic above");
        } catch (OpenAiClient.Failure failure) {
            System.out.println("AI diagnostic provider failure: " + failure.getMessage());
            throw failure;
        } finally {
            budget.finish(job.id(), success);
        }
    }
}
