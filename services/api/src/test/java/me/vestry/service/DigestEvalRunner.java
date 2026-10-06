package me.vestry.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import me.vestry.api.OpenAiClient;
import me.vestry.config.AiConfig.AiLimits;
import me.vestry.dto.DigestContent;
import me.vestry.dto.NewsBriefing;
import me.vestry.model.PortfolioDigest;
import me.vestry.repository.PortfolioDigestRepository;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Manual Promptfoo entry point; ordinary Maven tests never invoke paid generation. */
public final class DigestEvalRunner {
    private static final ObjectMapper MAPPER = new ObjectMapper().findAndRegisterModules();

    public static void main(String[] args) throws Exception {
        String key = System.getenv("OPENAI_API_KEY");
        if (!"true".equals(System.getenv("VESTRY_AI_EVAL")) || key == null || key.isBlank()) {
            throw new IllegalStateException("Paid evaluation requires VESTRY_AI_EVAL=true and OPENAI_API_KEY");
        }
        if (args.length == 0) throw new IllegalArgumentException("Expected a synthetic fixture as JSON");
        // Promptfoo treats stdout as the output, so library diagnostics belong on stderr.
        var output = System.out;
        System.setOut(System.err);
        var client = new OpenAiClient(MAPPER, singleCallBudget(), new AiLimits(true, 10_000, 10_000, 1), key);
        output.println(MAPPER.writeValueAsString(evaluate(MAPPER.readTree(args[0]), client)));
    }

    static DigestContent evaluate(JsonNode fixture, OpenAiClient client) throws Exception {
        var portfolio = fixture.required("portfolio");
        var capturedAt = Instant.parse(portfolio.required("capturedAt").asText());
        var tickers = new ArrayList<String>();
        portfolio.required("holdings").forEach(holding -> tickers.add(holding.required("ticker").asText()));
        var snapshot = new DigestContextService.Snapshot(0, false, capturedAt, tickers, portfolio.toString());
        var briefing = MAPPER.treeToValue(fixture.required("news"), NewsBriefing.class);
        var job = UUID.randomUUID();
        var news = mock(NewsService.class);
        when(news.getOrFetch(job, tickers)).thenReturn(briefing);
        var repository = mock(PortfolioDigestRepository.class);
        when(repository.saveAndFlush(any(PortfolioDigest.class))).thenAnswer(call -> call.getArgument(0));
        var service = new DigestService(client, news, repository, mock(DemoSessionResolver.class),
                MAPPER, Clock.fixed(capturedAt, ZoneOffset.UTC));
        return service.generate(job, snapshot).content();
    }

    /** Test-only accounting: one attempted call, with no persistent daily/lifetime budget. */
    static AiBudgetService singleCallBudget() {
        var budget = mock(AiBudgetService.class);
        var attempted = new AtomicBoolean();
        when(budget.reserveCall(any(), anyString(), anyLong())).thenAnswer(call -> {
            if (!"digest".equals(call.getArgument(1)) || attempted.getAndSet(true)) {
                throw new IllegalStateException("Evaluation permits one digest call only");
            }
            return UUID.randomUUID();
        });
        return budget;
    }
}
