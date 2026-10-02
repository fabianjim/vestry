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
        when(client.generate(any(), anyString(), any())).thenReturn(response(List.of(story("https://news.example/story", "2026-10-01"))));
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
    void keepsOnlyDatedCitedHttpsStoriesAndDeduplicatesSources() {
        var good = story("https://news.example/story", "2026-10-01");
        when(client.generate(any(), anyString(), any())).thenReturn(response(List.of(good, good,
                story("https://invented.example/story", "2026-10-01"),
                story("https://news.example/story", "2025-01-01"))));
        var result = service.getOrFetch(job, List.of("AAPL"));
        assertEquals(Status.READY, result.status());
        assertEquals(1, result.items().size());
        assertEquals("https://news.example/story", result.items().get(0).url());
    }

    @Test
    void emptyNewsIsCachedAndDistinctFromRejectedNews() {
        when(client.generate(any(), anyString(), any())).thenReturn(response(List.of()));
        assertEquals(Status.EMPTY, service.getOrFetch(job, List.of()).status());
        assertEquals(Status.EMPTY, service.getOrFetch(job, List.of()).status());
        verify(client, times(1)).generate(any(), anyString(), argThat(r -> r.input().contains("broad market only")));
        when(client.generate(any(), anyString(), any())).thenReturn(response(List.of(
                story("javascript:alert(1)", "2026-10-01"), story("https://news.example/story", "2026-10-03"),
                story("https://news.example/story", "not-a-date"))));
        assertEquals(Status.UNAVAILABLE, service.getOrFetch(job, List.of("AAPL")).status());
    }

    @Test
    void failuresMalformedOutputAndUnsearchedAnswersAreNotRetried() {
        when(client.generate(any(), anyString(), any())).thenThrow(new IllegalStateException("provider unavailable"));
        assertEquals(Status.UNAVAILABLE, service.getOrFetch(job, List.of("AAPL")).status());
        assertEquals(Status.UNAVAILABLE, service.getOrFetch(job, List.of("AAPL")).status());
        verify(client, times(1)).generate(any(), anyString(), any());
        var malformed = response(List.of());
        ((com.fasterxml.jackson.databind.node.ObjectNode) malformed.path("output").get(1).path("content").get(0)).put("text", "not json");
        doReturn(malformed).when(client).generate(any(), anyString(), any());
        assertEquals(Status.UNAVAILABLE, service.getOrFetch(job, List.of("MSFT")).status());
        var unsearched = mapper.createObjectNode().set("output", mapper.createArrayNode().add(response(List.of()).path("output").get(1)));
        when(client.generate(any(), anyString(), any())).thenReturn(unsearched);
        assertEquals(Status.UNAVAILABLE, service.getOrFetch(job, List.of("GOOG")).status());
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
        when(client.generate(any(), anyString(), any())).thenReturn(response(List.of()));
        var executor = Executors.newFixedThreadPool(2);
        try {
            Callable<Status> fetch = () -> { gate.await(); return service.getOrFetch(job, List.of("AAPL")).status(); };
            var a = executor.submit(fetch);
            var b = executor.submit(fetch);
            gate.countDown();
            assertTrue(Set.of(Status.EMPTY, Status.UNAVAILABLE).contains(a.get(10, TimeUnit.SECONDS)));
            assertTrue(Set.of(Status.EMPTY, Status.UNAVAILABLE).contains(b.get(10, TimeUnit.SECONDS)));
            verify(client, times(1)).generate(any(), anyString(), any());
            assertEquals(1, cache.count());
            assertEquals(Status.EMPTY, service.getOrFetch(job, List.of("AAPL")).status());
        } finally { executor.shutdownNow(); }
    }

    private Map<String, String> story(String url, String date) {
        return Map.of("headline", "Company reports earnings", "summary", "The company published its quarterly results.",
                "publishedOn", date, "url", url);
    }

    private JsonNode response(List<Map<String, String>> stories) {
        var output = mapper.createArrayNode();
        var search = output.addObject().put("type", "web_search_call").put("status", "completed");
        search.putObject("action").putArray("sources").addObject().put("url", "https://news.example/story");
        var content = output.addObject().put("type", "message").putArray("content").addObject().put("type", "output_text");
        content.put("text", mapper.createObjectNode().set("items", mapper.valueToTree(stories)).toString());
        return mapper.createObjectNode().set("output", output);
    }
}
