package me.vestry.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import me.vestry.api.OpenAiClient;
import me.vestry.config.AiConfig.AiLimits;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class DigestEvalRunnerTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private OpenAiClient client;
    private MockRestServiceServer server;
    private static final String FIXTURE = """
            {"portfolio":{"capturedAt":"2026-10-06T16:00:00Z","holdings":[],"journal":[],
              "recentTransactions":[],"previousCoverage":[],"portfolioValue":null},
             "news":{"newsDate":"2026-10-06","fetchedAt":"2026-10-06T16:00:00Z",
              "status":"UNAVAILABLE","items":[],"research":""}}
            """;

    @BeforeEach
    void setup() {
        client = new OpenAiClient(mapper, DigestEvalRunner.singleCallBudget(),
                new AiLimits(true, 10_000, 10_000, 1), "test-key");
        server = MockRestServiceServer.bindTo((RestTemplate) ReflectionTestUtils.getField(client, "http")).build();
    }

    @Test
    void usesApplicationRequestAndReturnsValidatedContentWithoutDatabaseOrSearch() throws Exception {
        var body = mapper.createObjectNode().put("news", "").put("reflection", "Record a thought about your portfolio.");
        body.putArray("sourceIds");
        body.putArray("questions").addObject().put("text", "Record a thought").put("destination", "JOURNAL");
        server.expect(requestTo("https://api.openai.com/v1/responses"))
                .andExpect(jsonPath("$.model").value(OpenAiClient.MODEL))
                .andExpect(jsonPath("$.tools").doesNotExist())
                .andExpect(jsonPath("$.text.format.strict").value(true))
                .andExpect(jsonPath("$.max_output_tokens").value(800))
                .andRespond(withSuccess(response(body.toString()), MediaType.APPLICATION_JSON));
        var content = DigestEvalRunner.evaluate(mapper.readTree(FIXTURE), client);
        assertEquals("News is currently unavailable.", content.news());
        assertEquals("Record a thought about your portfolio.", content.reflection());
        assertTrue(content.sources().isEmpty());
        server.verify();
    }

    @Test
    void invalidModelContentFailsInsteadOfReturningFallbackSuccess() throws Exception {
        server.expect(anything()).andRespond(withSuccess(response("{}"), MediaType.APPLICATION_JSON));
        assertThrows(IllegalStateException.class, () -> DigestEvalRunner.evaluate(mapper.readTree(FIXTURE), client));
        server.verify();
    }

    @Test
    void providerFailureIsNotRetried() {
        server.expect(anything()).andRespond(withServerError());
        assertThrows(OpenAiClient.Failure.class, () -> DigestEvalRunner.evaluate(mapper.readTree(FIXTURE), client));
        server.verify();
    }

    @Test
    void budgetRejectsAdditionalCallsAndNewsCalls() {
        var budget = DigestEvalRunner.singleCallBudget();
        assertNotNull(budget.reserveCall(UUID.randomUUID(), "digest", 1000));
        assertThrows(IllegalStateException.class, () -> budget.reserveCall(UUID.randomUUID(), "digest", 1000));
        assertThrows(IllegalStateException.class,
                () -> DigestEvalRunner.singleCallBudget().reserveCall(UUID.randomUUID(), "news", 1000));
    }

    private String response(String text) {
        var response = mapper.createObjectNode().put("status", "completed");
        response.putObject("usage").put("input_tokens", 100).put("output_tokens", 50);
        response.putArray("output").addObject().put("type", "message")
                .putArray("content").addObject().put("type", "output_text").put("text", text);
        return response.toString();
    }
}
