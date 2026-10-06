package me.vestry.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.sdk.common.CompletableResultCode;
import io.opentelemetry.sdk.testing.exporter.InMemorySpanExporter;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.data.SpanData;
import io.opentelemetry.sdk.trace.export.BatchSpanProcessor;
import io.opentelemetry.sdk.trace.export.SimpleSpanProcessor;
import io.opentelemetry.sdk.trace.export.SpanExporter;
import me.vestry.api.OpenAiClient;
import me.vestry.config.AiConfig.AiLimits;
import me.vestry.dto.NewsBriefing;
import me.vestry.model.NewsCache;
import me.vestry.model.PortfolioDigest;
import me.vestry.repository.NewsCacheRepository;
import me.vestry.repository.PortfolioDigestRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class BriefingTracingTest {
    private static final String PRIVATE_CONTEXT = "PRIVATE_JOURNAL_SENTINEL";
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private final Clock clock = Clock.fixed(Instant.parse("2026-10-06T16:00:00Z"), ZoneOffset.UTC);
    private final NewsCacheRepository cache = mock(NewsCacheRepository.class);
    private final PortfolioDigestRepository digests = mock(PortfolioDigestRepository.class);
    private InMemorySpanExporter exporter;
    private BriefingTracing tracing;
    private DigestService service;
    private MockRestServiceServer server;

    @BeforeEach
    void setup() {
        exporter = InMemorySpanExporter.create();
        var provider = SdkTracerProvider.builder().addSpanProcessor(SimpleSpanProcessor.create(exporter)).build();
        tracing = new BriefingTracing(provider.get("test"), provider, "production", "test-release", false);
        wire(tracing);
    }

    private void wire(BriefingTracing telemetry) {
        var budget = mock(AiBudgetService.class);
        when(budget.reserveCall(any(), anyString(), anyLong())).thenReturn(UUID.randomUUID());
        var client = new OpenAiClient(mapper, budget, new AiLimits(true, 100000, 100000, 5), "secret-test-key", telemetry);
        server = MockRestServiceServer.bindTo((RestTemplate) ReflectionTestUtils.getField(client, "http")).build();
        when(cache.saveAndFlush(any(NewsCache.class))).thenAnswer(call -> call.getArgument(0));
        when(digests.saveAndFlush(any(PortfolioDigest.class))).thenAnswer(call -> call.getArgument(0));
        service = new DigestService(client, new NewsService(client, cache, mapper, clock, telemetry), digests,
                mock(DemoSessionResolver.class), mapper, clock, telemetry);
    }

    @AfterEach void cleanup() { tracing.close(); }

    @Test
    void demoIncludesActualInputsOutputsUsageAndNestedResearchAndValidation() {
        expectResearch();
        expectWriter(validBody());
        var result = service.generate(UUID.randomUUID(), snapshot(true));
        assertEquals(NewsBriefing.Status.EMPTY, result.content().newsStatus());
        var spans = exporter.getFinishedSpanItems();
        assertEquals(5, spans.size());
        var root = named("generate-portfolio-briefing");
        var retrieval = named("retrieve-market-news");
        var research = named("research-market-news");
        var writer = named("write-portfolio-briefing");
        assertEquals(root.getSpanId(), retrieval.getParentSpanId());
        assertEquals(retrieval.getSpanId(), research.getParentSpanId());
        assertEquals(root.getSpanId(), writer.getParentSpanId());
        assertEquals(root.getSpanId(), named("validate-portfolio-briefing").getParentSpanId());
        assertTrue(spans.stream().allMatch(s -> s.getTraceId().equals(root.getTraceId())));
        assertEquals("generation", attr(writer, "langfuse.observation.type"));
        assertEquals(OpenAiClient.MODEL, attr(writer, "langfuse.observation.model.name"));
        assertTrue(attr(writer, "langfuse.observation.usage_details").contains("\"input\":100"));
        assertNotNull(attr(writer, "langfuse.observation.cost_details"));
        assertTrue(attr(writer, "langfuse.observation.input").contains(PRIVATE_CONTEXT));
        assertTrue(attr(root, "langfuse.observation.output").contains("Record a thought"));
        assertTrue(spans.stream().allMatch(s -> "demo".equals(attr(s, "langfuse.observation.metadata.run_kind"))));
        assertTrue(spans.stream().allMatch(s -> "production".equals(attr(s, "langfuse.environment"))));
        assertFalse(spans.toString().contains("secret-test-key"));
        assertFalse(Span.current().getSpanContext().isValid());
        server.verify();
    }

    @Test
    void cachedNewsSkipsResearchAndRealUserContentNeverLeavesTheProcess() {
        cachedNews();
        expectWriter(validBody());
        service.generate(UUID.randomUUID(), snapshot(false));
        assertEquals(4, exporter.getFinishedSpanItems().size());
        assertEquals("true", attr(named("retrieve-market-news"), "langfuse.observation.metadata.cache_hit"));
        String exported = exporter.getFinishedSpanItems().toString();
        assertFalse(exported.contains(PRIVATE_CONTEXT));
        assertFalse(exported.contains("Record a thought"));
        assertFalse(exported.contains("secret-test-key"));
        assertTrue(exporter.getFinishedSpanItems().stream()
                .filter(s -> !s.getName().equals("generate-portfolio-briefing"))
                .allMatch(s -> attr(s, "langfuse.observation.input") == null));
        assertEquals("metadata-only", attr(named("write-portfolio-briefing"), "langfuse.observation.metadata.content_capture"));
        assertTrue(attr(named("generate-portfolio-briefing"), "langfuse.observation.output").contains("READY"));
        server.verify();
    }

    @Test
    void failedNewsRemainsVisibleWhenTheBriefingSuccessfullyFallsBack() {
        server.expect(anything()).andRespond(withServerError().body("PRIVATE_PROVIDER_ERROR"));
        expectWriter(validBody());
        assertEquals(NewsBriefing.Status.UNAVAILABLE, service.generate(UUID.randomUUID(), snapshot(false)).content().newsStatus());
        assertEquals(StatusCode.ERROR, named("research-market-news").getStatus().getStatusCode());
        assertEquals("WARNING", attr(named("retrieve-market-news"), "langfuse.observation.level"));
        assertNotEquals(StatusCode.ERROR, named("generate-portfolio-briefing").getStatus().getStatusCode());
        assertFalse(exporter.getFinishedSpanItems().toString().contains("PRIVATE_PROVIDER_ERROR"));
        server.verify();
    }

    @Test
    void validationFailureClosesContextBeforeTheSameWorkerProcessesARealUser() throws Exception {
        cachedNews();
        expectWriter("{}");
        expectWriter(validBody());
        var worker = Executors.newSingleThreadExecutor();
        try {
            worker.submit(() -> {
                assertThrows(IllegalStateException.class, () -> service.generate(UUID.randomUUID(), snapshot(true)));
                assertFalse(Span.current().getSpanContext().isValid());
                service.generate(UUID.randomUUID(), snapshot(false));
                assertFalse(Span.current().getSpanContext().isValid());
            }).get(10, TimeUnit.SECONDS);
        } finally { worker.shutdownNow(); }
        var spans = exporter.getFinishedSpanItems();
        assertEquals(2, spans.stream().map(SpanData::getTraceId).distinct().count());
        var validation = spans.stream().filter(s -> s.getName().equals("validate-portfolio-briefing")).findFirst().orElseThrow();
        assertEquals(StatusCode.ERROR, validation.getStatus().getStatusCode());
        assertEquals("BRIEFING_VALIDATION_FAILED", validation.getStatus().getDescription());
        assertFalse(spans.stream().filter(s -> "user".equals(attr(s, "langfuse.observation.metadata.run_kind")))
                .map(Object::toString).anyMatch(s -> s.contains(PRIVATE_CONTEXT)));
        server.verify();
    }

    @Test
    void failedBackgroundExportsDoNotFailGenerationAndShutdownDrainsTheQueue() {
        tracing.close();
        var attempted = new AtomicBoolean();
        var stopped = new AtomicBoolean();
        SpanExporter failing = new SpanExporter() {
            public CompletableResultCode export(Collection<SpanData> spans) {
                attempted.set(true);
                return CompletableResultCode.ofFailure();
            }
            public CompletableResultCode flush() { return CompletableResultCode.ofSuccess(); }
            public CompletableResultCode shutdown() { stopped.set(true); return CompletableResultCode.ofSuccess(); }
        };
        var provider = SdkTracerProvider.builder().addSpanProcessor(BatchSpanProcessor.builder(failing).build()).build();
        tracing = new BriefingTracing(provider.get("test"), provider, "production", "", false);
        wire(tracing);
        cachedNews();
        expectWriter(validBody());
        assertNotNull(service.generate(UUID.randomUUID(), snapshot(false)));
        tracing.close();
        assertTrue(attempted.get());
        assertTrue(stopped.get());
        server.verify();
    }

    @Test
    void incompleteConfigurationAndDisabledTracingAreSafeNoOps() {
        try (var disabled = BriefingTracing.create(true, "https://us.cloud.langfuse.com", "", "",
                "production", "", false)) {
            wire(disabled);
            cachedNews();
            expectWriter(validBody());
            assertNotNull(service.generate(UUID.randomUUID(), snapshot(false)));
            assertTrue(exporter.getFinishedSpanItems().isEmpty());
            server.verify();
        }
    }

    private DigestContextService.Snapshot snapshot(boolean demo) {
        return new DigestContextService.Snapshot(7, demo, clock.instant(), List.of("AAPL"),
                "{\"journal\":[{\"body\":\"" + PRIVATE_CONTEXT + "\"}],\"holdings\":[]}");
    }

    private void cachedNews() {
        var entry = new NewsCache("key", java.time.LocalDate.of(2026, 10, 6), clock.instant());
        entry.complete(NewsBriefing.Status.EMPTY, mapper.valueToTree(new NewsBriefing(entry.getNewsDate(),
                clock.instant(), NewsBriefing.Status.EMPTY, List.of())), clock.instant());
        when(cache.findById(anyString())).thenReturn(Optional.of(entry));
    }

    private void expectResearch() {
        server.expect(anything()).andExpect(jsonPath("$.tools[0].type").value("web_search"))
                .andRespond(withSuccess(response("NO_RELEVANT_NEWS", true), MediaType.APPLICATION_JSON));
    }

    private void expectWriter(String text) {
        server.expect(anything()).andExpect(jsonPath("$.tools").doesNotExist())
                .andRespond(withSuccess(response(text, false), MediaType.APPLICATION_JSON));
    }

    private String response(String text, boolean search) {
        var body = mapper.createObjectNode().put("status", "completed");
        body.putObject("usage").put("input_tokens", 100).put("output_tokens", 50);
        var output = body.putArray("output");
        if (search) output.addObject().put("type", "web_search_call").put("status", "completed");
        output.addObject().put("type", "message").putArray("content").addObject()
                .put("type", "output_text").put("text", text);
        return body.toString();
    }

    private String validBody() {
        return "{\"news\":\"\",\"reflection\":\"Record a thought about your portfolio.\",\"sourceIds\":[],"
                + "\"questions\":[{\"text\":\"Record a thought\",\"destination\":\"JOURNAL\"}]}";
    }

    private SpanData named(String name) {
        return exporter.getFinishedSpanItems().stream().filter(s -> s.getName().equals(name)).findFirst().orElseThrow();
    }

    private String attr(SpanData span, String key) { return span.getAttributes().get(AttributeKey.stringKey(key)); }
}
