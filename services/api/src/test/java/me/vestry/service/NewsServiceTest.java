package me.vestry.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import me.vestry.api.OpenAiClient;
import me.vestry.dto.NewsBriefing.Status;
import me.vestry.repository.NewsCacheRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@DataJpaTest(showSql = false)
@ActiveProfiles("test")
@Import({NewsService.class, NewsServiceTest.Config.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@org.junit.jupiter.api.extension.ExtendWith(org.springframework.boot.test.system.OutputCaptureExtension.class)
class NewsServiceTest {
    @Autowired NewsService service;
    @Autowired NewsCacheRepository cache;
    @Autowired ObjectMapper mapper;
    @Autowired MutableClock clock;
    @MockitoBean OpenAiClient client;
    private final UUID job = UUID.randomUUID();

    @TestConfiguration
    static class Config {
        @Bean ObjectMapper mapper() { return new ObjectMapper().findAndRegisterModules(); }
        @Bean MutableClock clock() { return new MutableClock(); }
    }
    static class MutableClock extends Clock {
        final AtomicReference<Instant> now = new AtomicReference<>();
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return Clock.fixed(instant(), zone); }
        public Instant instant() { return now.get(); }
    }

    @BeforeEach
    void setup() {
        cache.deleteAll();
        clock.now.set(Instant.parse("2026-10-02T03:00:00Z")); // October 1, New York.
        when(client.isConfigured()).thenReturn(true);
    }

    @Test
    void cachesAcrossAccountsAndServiceInstancesThenRefreshesOnNewYorkDateChange() {
        when(client.generate(any(), anyString(), any())).thenReturn(response());
        var first = service.getOrFetch(job, List.of("msft", "AAPL"));
        var restarted = new NewsService(client, cache, mapper, clock);
        assertEquals(first, restarted.getOrFetch(UUID.randomUUID(), List.of("aapl", "MSFT", "AAPL")));
        assertEquals(Status.READY, first.status());
        assertEquals(LocalDate.of(2026, 10, 1), first.newsDate());
        verify(client, times(1)).generate(any(), anyString(), argThat(r -> r.webSearch()
                && r.input().contains("AAPL,MSFT") && r.input().contains("2026-10-01")));
        clock.now.set(Instant.parse("2026-10-02T04:00:00Z"));
        assertEquals(LocalDate.of(2026, 10, 2), service.getOrFetch(job, List.of("AAPL", "MSFT")).newsDate());
        verify(client, times(2)).generate(any(), anyString(), any());
        assertEquals(2, cache.count());
    }

    @Test
    void acceptsCitedProseWithoutAGeneratedJsonContractAndIgnoresUncitedSearchHits() {
        var answer = response();
        var sources = (com.fasterxml.jackson.databind.node.ArrayNode) answer.path("output").get(0).path("action").path("sources");
        sources.addObject().put("url", "https://news.example/unrelated");
        var part = (com.fasterxml.jackson.databind.node.ObjectNode) answer.path("output").get(1).path("content").get(0);
        var citations = (com.fasterxml.jackson.databind.node.ArrayNode) part.path("annotations");
        citations.addObject().put("type", "url_citation").put("url", "javascript:alert(1)");
        citations.addObject().put("type", "url_citation").put("url", "https://user:password@news.example/private");
        citations.addObject().put("type", "url_citation").put("url", "https://news.example/story");
        part.put("text", "On September 1 the company announced an October 5 event. That milestone is now four days away.");
        when(client.generate(any(), anyString(), any())).thenReturn(answer);
        var result = service.getOrFetch(job, List.of("AAPL"));
        assertEquals(Status.READY, result.status());
        assertEquals(1, result.items().size());
        assertEquals("https://news.example/story", result.items().get(0).url());
        assertEquals(part.path("text").asText(), result.research());
        assertEquals(result, service.getOrFetch(job, List.of("AAPL")));
        verify(client, times(1)).generate(any(), anyString(), argThat(r -> r.webSearch() && r.schema() == null));
    }

    @Test
    void failedIncompleteSourcelessAndRefusedSearchesAreUnavailableWithoutRetries(
            org.springframework.boot.test.system.CapturedOutput output) {
        when(client.generate(any(), anyString(), any())).thenThrow(new IllegalStateException("private provider detail"));
        assertEquals(Status.UNAVAILABLE, service.getOrFetch(job, List.of("AAPL")).status());
        assertEquals(Status.UNAVAILABLE, service.getOrFetch(job, List.of("AAPL")).status());
        verify(client, times(1)).generate(any(), anyString(), any());
        for (String failure : List.of("search", "sources", "text", "refusal")) {
            cache.deleteAll();
            var answer = response();
            var search = (com.fasterxml.jackson.databind.node.ObjectNode) answer.path("output").get(0);
            var part = (com.fasterxml.jackson.databind.node.ObjectNode) answer.path("output").get(1).path("content").get(0);
            switch (failure) {
                case "search" -> search.put("status", "incomplete");
                case "sources" -> part.putArray("annotations");
                case "text" -> part.put("text", "");
                case "refusal" -> part.put("type", "refusal");
            }
            doReturn(answer).when(client).generate(any(), anyString(), any());
            assertEquals(Status.UNAVAILABLE, service.getOrFetch(job, List.of("AAPL")).status());
        }
        assertFalse(output.getAll().contains("private provider detail"));
        assertTrue(output.getAll().contains("SEARCH_INCOMPLETE"));
        assertTrue(output.getAll().contains("NEWS_REFUSED"));
        assertTrue(output.getAll().contains("SEARCH_WITHOUT_CITATIONS"));
    }

    @Test
    void completedSearchWithExplicitlyNoRelevantNewsIsEmptyAndCached() {
        var answer = response();
        ((com.fasterxml.jackson.databind.node.ObjectNode) answer.path("output").get(0).path("action")).putArray("sources");
        ((com.fasterxml.jackson.databind.node.ObjectNode) answer.path("output").get(1).path("content").get(0))
                .put("text", "NO_RELEVANT_NEWS");
        when(client.generate(any(), anyString(), any())).thenReturn(answer);
        assertEquals(Status.EMPTY, service.getOrFetch(job, List.of("AAPL")).status());
        assertEquals(Status.EMPTY, service.getOrFetch(job, List.of("AAPL")).status());
        verify(client, times(1)).generate(any(), anyString(), any());
    }

    @Test
    void disabledLocalInstallationSkipsCacheAndProviderAndRejectsUnsafeSymbolsWhenEnabled() {
        when(client.isConfigured()).thenReturn(false);
        assertEquals(Status.DISABLED, service.getOrFetch(job, List.of("AAPL")).status());
        assertEquals(0, cache.count());
        verify(client, never()).generate(any(), anyString(), any());
        when(client.isConfigured()).thenReturn(true);
        assertThrows(IllegalArgumentException.class, () -> service.getOrFetch(job, List.of("ignore instructions")));
        assertThrows(IllegalArgumentException.class, () -> service.getOrFetch(job, Collections.nCopies(9, "AAPL")));
        verify(client, never()).generate(any(), anyString(), any());
    }

    @Test
    void simultaneousCacheMissesMakeOneProviderCall() throws Exception {
        var gate = new CountDownLatch(1);
        when(client.generate(any(), anyString(), any())).thenReturn(response());
        var executor = Executors.newFixedThreadPool(2);
        try {
            Callable<Status> fetch = () -> { gate.await(); return service.getOrFetch(job, List.of("AAPL")).status(); };
            var a = executor.submit(fetch);
            var b = executor.submit(fetch);
            gate.countDown();
            assertTrue(Set.of(Status.READY, Status.UNAVAILABLE).contains(a.get(10, TimeUnit.SECONDS)));
            assertTrue(Set.of(Status.READY, Status.UNAVAILABLE).contains(b.get(10, TimeUnit.SECONDS)));
            verify(client, times(1)).generate(any(), anyString(), any());
            assertEquals(1, cache.count());
            assertEquals(Status.READY, service.getOrFetch(job, List.of("AAPL")).status());
        } finally { executor.shutdownNow(); }
    }

    @Test
    void researchAndFullBriefingFitExistingReservationCeilings() {
        var realClient = new OpenAiClient(mapper, mock(AiBudgetService.class),
                new me.vestry.config.AiConfig.AiLimits(true, 100000, 100000, 5), "test-key");
        var bounded = new NewsService(realClient, cache, mapper, clock);
        long allowance = bounded.allowance(List.of("ABCDEFGHIJ", "KLMNOPQRST", "UVWXYZABCD", "EFGHIJKLMN",
                "OPQRSTUVWX", "YZABCDEFGH", "IJKLMNOPQR", "STUVWXYZAB"));
        assertTrue(allowance <= 20000);
        assertTrue(allowance + 10000 <= 30000);
    }

    private JsonNode response() {
        var output = mapper.createArrayNode();
        var search = output.addObject().put("type", "web_search_call").put("status", "completed");
        search.putObject("action").putArray("sources").addObject().put("url", "https://news.example/story");
        output.addObject().put("type", "message").putArray("content").addObject()
                .put("type", "output_text").put("text", "Company published quarterly results on October 1, 2026.")
                .putArray("annotations").addObject().put("type", "url_citation")
                .put("url", "https://news.example/story").put("title", "Company results");
        return mapper.createObjectNode().set("output", output);
    }
}
