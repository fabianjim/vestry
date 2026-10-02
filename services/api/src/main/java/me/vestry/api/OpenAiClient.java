package me.vestry.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import me.vestry.config.AiConfig.AiLimits;
import me.vestry.service.AiBudgetService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.UUID;

@Component
public class OpenAiClient {
    public static final String MODEL = "gpt-4.1-mini-2025-04-14";
    private static final String ENDPOINT = "https://api.openai.com/v1/responses";
    private final RestTemplate http;
    private final ObjectMapper mapper;
    private final AiBudgetService budget;
    private final AiLimits limits;
    private final String apiKey;

    public OpenAiClient(ObjectMapper mapper, AiBudgetService budget, AiLimits limits,
                        @Value("${vestry.ai.api-key:}") String apiKey) {
        this.mapper = mapper;
        this.budget = budget;
        this.limits = limits;
        this.apiKey = apiKey;
        var transport = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER).build();
        var factory = new JdkClientHttpRequestFactory(transport);
        factory.setReadTimeout(Duration.ofSeconds(30));
        http = new RestTemplate(factory);
    }

    public record Request(String instructions, String input, int maxOutputTokens, boolean webSearch) {
        public Request(String instructions, String input, int maxOutputTokens) {
            this(instructions, input, maxOutputTokens, false);
        }
    }

    public boolean isConfigured() {
        return limits.enabled() && !apiKey.isBlank() && limits.lifetimeMicros() > 0
                && limits.dailyMicros() > 0 && limits.dailyGenerations() > 0;
    }

    /** Conservative byte-based token allowance avoids adding a tokenizer dependency. */
    public long allowance(Request request) {
        return cost(body(request).getBytes(StandardCharsets.UTF_8).length + 2048L
                        + (request.webSearch() ? 8000 : 0), request.maxOutputTokens())
                + (request.webSearch() ? SEARCH_ALLOWANCE : 0);
    }

    public JsonNode generate(UUID jobId, String step, Request request) {
        if (!isConfigured()) throw new IllegalStateException("AI is not configured");
        String body = body(request);
        var headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);
        // This transaction commits before network I/O. Any ambiguous failure retains its reservation.
        long reserved = allowance(request);
        UUID call = budget.reserveCall(jobId, step, reserved);
        JsonNode response;
        try {
            String raw = http.postForObject(ENDPOINT, new HttpEntity<>(body, headers), String.class);
            response = mapper.readTree(raw == null ? "null" : raw);
        } catch (Exception failure) {
            // Do not expose provider bodies, prompts, or authorization headers through exceptions/logs.
            throw new IllegalStateException("AI provider request failed; no automatic retry");
        }
        if (response == null) throw new IllegalStateException("AI response is empty; reservation retained");
        JsonNode usage = response.path("usage");
        long input = tokenCount(usage.path("input_tokens"));
        long output = tokenCount(usage.path("output_tokens"));
        if (request.webSearch() && !response.path("output").isArray()) {
            throw new IllegalStateException("AI output is unavailable; reservation retained");
        }
        long searches = 0;
        for (var item : response.path("output")) {
            if ("web_search_call".equals(item.path("type").asText())) searches++;
        }
        // Charge the fixed search block separately even if provider usage includes it: never undercount.
        long actual = cost(input, output) + searches * SEARCH_ALLOWANCE;
        budget.settleCall(call, actual);
        if (actual > reserved) throw new IllegalStateException("AI usage exceeded its reservation");
        if (searches > (request.webSearch() ? 1 : 0)) {
            throw new IllegalStateException("AI exceeded its search limit");
        }
        if (!"completed".equals(response.path("status").asText()) || !response.path("output").isArray()) {
            throw new IllegalStateException("AI response was not completed");
        }
        return response;
    }

    private String body(Request request) {
        if (request == null || request.instructions() == null || request.input() == null
                || request.input().isBlank() || request.maxOutputTokens() < 16 || request.maxOutputTokens() > 1024
                || request.instructions().length() + (long) request.input().length() > 16000) {
            throw new IllegalArgumentException("Invalid or oversized AI request");
        }
        var payload = mapper.createObjectNode().put("model", MODEL).put("store", false)
                .put("instructions", request.instructions()).put("input", request.input())
                .put("max_output_tokens", request.maxOutputTokens());
        if (request.webSearch()) {
            payload.putArray("tools").addObject().put("type", "web_search").put("search_context_size", "low");
            payload.putObject("tool_choice").put("type", "web_search");
            payload.put("max_tool_calls", 1);
            payload.putArray("include").add("web_search_call.action.sources");
        }
        String body = payload.toString();
        if (body.getBytes(StandardCharsets.UTF_8).length > 16000) throw new IllegalArgumentException("AI input is too large");
        return body;
    }

    private static long tokenCount(JsonNode value) {
        if (!value.isIntegralNumber() || !value.canConvertToLong() || value.longValue() < 0 || value.longValue() > 1_000_000) {
            throw new IllegalStateException("AI usage is unavailable; reservation retained");
        }
        return value.longValue();
    }

    // One non-preview search: $0.01 tool fee + a fixed 8,000 input tokens at $0.40/M.
    private static final long SEARCH_ALLOWANCE = 13_200;

    // USD microdollars, rounded upward: $0.40/M input and $1.60/M output, without cache discounts.
    private static long cost(long input, long output) {
        return (input * 2 + output * 8 + 4) / 5;
    }
}
