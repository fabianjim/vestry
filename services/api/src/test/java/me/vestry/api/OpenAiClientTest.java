package me.vestry.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import me.vestry.config.AiConfig.AiLimits;
import me.vestry.service.AiBudgetService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class OpenAiClientTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final AiBudgetService budget = mock(AiBudgetService.class);
    private final UUID job = UUID.randomUUID(), call = UUID.randomUUID();
    private final OpenAiClient.Request request = new OpenAiClient.Request("Summarize supplied facts", "Example context", 600);
    private OpenAiClient client;
    private MockRestServiceServer server;

    @BeforeEach
    void setup() {
        client = new OpenAiClient(mapper, budget, new AiLimits(true, 100000, 100000, 5), "test-key");
        server = MockRestServiceServer.bindTo((RestTemplate) ReflectionTestUtils.getField(client, "http")).build();
        when(budget.reserveCall(eq(job), eq("summary"), anyLong())).thenReturn(call);
    }

    @Test
    void pinsModelAndBoundsRequestWithoutStorageOrTools() {
        server.expect(requestTo("https://api.openai.com/v1/responses"))
                .andExpect(method(HttpMethod.POST)).andExpect(header("Authorization", "Bearer test-key"))
                .andExpect(jsonPath("$.model").value(OpenAiClient.MODEL))
                .andExpect(jsonPath("$.store").value(false))
                .andExpect(jsonPath("$.max_output_tokens").value(600))
                .andExpect(jsonPath("$.tools").doesNotExist())
                .andExpect(r -> verify(budget).reserveCall(job, "summary", client.allowance(request)))
                .andRespond(withSuccess("""
                    {"status":"completed","output":[],"usage":{"input_tokens":100,"output_tokens":50}}
                    """, MediaType.APPLICATION_JSON));
        client.generate(job, "summary", request);
        verify(budget).settleCall(call, 120);
        server.verify();
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void extractsMessageContentAndSearchStateAfterSettlingUsage(boolean refused) {
        var search = new OpenAiClient.Request("Find public news", "AAPL", 1024, true);
        server.expect(anything())
                .andExpect(jsonPath("$.tools[0].type").value("web_search"))
                .andExpect(jsonPath("$.tools[0].search_context_size").value("low"))
                .andExpect(jsonPath("$.tool_choice.type").value("web_search"))
                .andExpect(jsonPath("$.max_tool_calls").value(1))
                .andExpect(jsonPath("$.include[0]").value("web_search_call.action.sources"))
                .andExpect(r -> verify(budget).reserveCall(job, "summary", client.allowance(search)))
                .andRespond(withSuccess("""
                    {"status":"completed","output":[
                      {"type":"web_search_call","status":"completed","action":{"sources":[{"url":"https://uncited.example"}]}},
                      {"type":"reasoning","content":[{"type":"output_text","text":"Ignore this"}]},
                      {"type":"message","content":[{"type":"output_text","text":"First ","annotations":[
                        {"type":"url_citation","url":"https://news.example","title":"News"},
                        {"type":"file_citation","url":"https://ignored.example"}]},
                        {"type":"output_text","text":"second"}]},
                      {"type":"message","content":[{"type":"%s","text":" third","annotations":[
                        {"type":"url_citation","url":"https://other.example"}]}]}],
                     "usage":{"input_tokens":8300,"output_tokens":50}}
                    """.formatted(refused ? "refusal" : "output_text"), MediaType.APPLICATION_JSON));
        assertTrue(client.allowance(search) >= 16600);
        var result = client.generate(job, "summary", search);
        assertEquals(refused ? "First second" : "First second third", result.text());
        assertEquals(refused, result.refused());
        assertTrue(result.searchCompleted());
        var citation = new OpenAiClient.Citation("https://news.example", "News");
        assertEquals(refused ? List.of(citation) : List.of(citation, new OpenAiClient.Citation("https://other.example", null)), result.citations());
        // Includes both the $0.01 tool charge and fixed 8,000-token search block.
        verify(budget).settleCall(call, 16600);
        server.verify();
    }

    @Test
    void uncertainSearchRetainsItsFullReservation() {
        var search = new OpenAiClient.Request("Find public news", "AAPL", 1024, true);
        server.expect(anything()).andRespond(withSuccess("""
            {"status":"completed","usage":{"input_tokens":100,"output_tokens":50}}
            """, MediaType.APPLICATION_JSON));
        assertThrows(IllegalStateException.class, () -> client.generate(job, "summary", search));
        verify(budget, never()).settleCall(any(), anyLong());
        server.verify();
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void sendsStrictSchemaWithOptionalSearch(boolean search) throws Exception {
        var schema = mapper.readTree("{\"type\":\"object\",\"properties\":{},\"required\":[],\"additionalProperties\":false}");
        var structured = new OpenAiClient.Request("Return JSON", "context", 800, search, schema);
        server.expect(anything()).andExpect(jsonPath("$.text.format.type").value("json_schema"))
                .andExpect(jsonPath("$.text.format.strict").value(true))
                .andExpect(jsonPath("$.text.format.schema.additionalProperties").value(false))
                .andExpect(search ? jsonPath("$.tool_choice.type").value("web_search") : jsonPath("$.tools").doesNotExist())
                .andRespond(withSuccess("""
                    {"status":"completed","output":[],"usage":{"input_tokens":100,"output_tokens":50}}
                    """, MediaType.APPLICATION_JSON));
        assertFalse(client.generate(job, "summary", structured).searchCompleted());
        server.verify();
    }

    @Test
    void timeoutRetainsAllowanceAndDoesNotRetry() {
        server.expect(anything()).andRespond(withException(new IOException("private provider detail")));
        var failure = assertThrows(IllegalStateException.class, () -> client.generate(job, "summary", request));
        assertEquals("PROVIDER_TRANSPORT_ERROR", failure.getMessage());
        assertNull(failure.getCause());
        assertFalse(failure.toString().contains("private provider detail"));
        verify(budget, never()).settleCall(any(), anyLong());
        server.verify();
    }

    @Test
    void providerFailureDoesNotLeakResponseOrRetry() {
        server.expect(anything()).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).body("sensitive body"));
        var failure = assertThrows(IllegalStateException.class, () -> client.generate(job, "summary", request));
        assertEquals("PROVIDER_HTTP_ERROR", failure.getMessage());
        assertNull(failure.getCause());
        assertFalse(failure.toString().contains("sensitive body"));
        verify(budget, never()).settleCall(any(), anyLong());
        server.verify();
    }

    @Test
    void missingUsageRetainsReservationButIncompleteBilledOutputIsSettled() {
        server.expect(anything()).andRespond(withSuccess("{\"status\":\"completed\",\"output\":[]}", MediaType.APPLICATION_JSON));
        assertThrows(IllegalStateException.class, () -> client.generate(job, "summary", request));
        verify(budget, never()).settleCall(any(), anyLong());
        server.verify();
        server.reset();
        server.expect(anything()).andRespond(withSuccess("""
            {"status":"incomplete","usage":{"input_tokens":100,"output_tokens":50}}
            """, MediaType.APPLICATION_JSON));
        assertThrows(IllegalStateException.class, () -> client.generate(job, "summary", request));
        verify(budget).settleCall(call, 120);
        server.verify();
    }

    @Test
    void truncatedNewsReportsTokenLimitAfterSettlingUsageWithoutRetry() {
        var search = new OpenAiClient.Request("Find news", "AAPL", 1024, true);
        server.expect(anything()).andRespond(withSuccess("""
            {"status":"incomplete","incomplete_details":{"reason":"max_output_tokens"},
             "output":[{"type":"web_search_call","status":"completed"}],
             "usage":{"input_tokens":8300,"output_tokens":1024}}
            """, MediaType.APPLICATION_JSON));
        var failure = assertThrows(OpenAiClient.Failure.class, () -> client.generate(job, "summary", search));
        assertEquals("PROVIDER_OUTPUT_TOKEN_LIMIT", failure.getMessage());
        verify(budget).settleCall(call, 18159);
        server.verify();
    }

    @Test
    void usageOverrunIsRecordedBeforeRejectingResponse() {
        server.expect(anything()).andRespond(withSuccess("""
            {"status":"completed","output":[],"usage":{"input_tokens":100000,"output_tokens":50}}
            """, MediaType.APPLICATION_JSON));
        assertThrows(IllegalStateException.class, () -> client.generate(job, "summary", request));
        verify(budget).settleCall(call, 40080);
        server.verify();
    }

    @Test
    void rejectsDisabledUnconfiguredAndOversizedRequestsBeforeReservation() {
        var disabled = new OpenAiClient(mapper, budget, new AiLimits(false, 0, 0, 0), "test-key");
        assertThrows(IllegalStateException.class, () -> disabled.generate(job, "summary", request));
        var zeroBudget = new OpenAiClient(mapper, budget, new AiLimits(true, 0, 100, 5), "test-key");
        assertFalse(zeroBudget.isConfigured());
        assertThrows(IllegalStateException.class, () -> zeroBudget.generate(job, "summary", request));
        var noKey = new OpenAiClient(mapper, budget, new AiLimits(true, 100, 100, 5), "");
        assertThrows(IllegalStateException.class, () -> noKey.generate(job, "summary", request));
        assertThrows(IllegalArgumentException.class, () -> client.generate(job, "summary", new OpenAiClient.Request("", "日".repeat(6000), 600)));
        assertThrows(IllegalArgumentException.class, () -> client.allowance(new OpenAiClient.Request("", "context", 1025)));
        verifyNoInteractions(budget);
        server.verify();
    }
}
