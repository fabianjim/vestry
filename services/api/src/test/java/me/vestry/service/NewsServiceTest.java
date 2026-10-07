package me.vestry.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import me.vestry.api.OpenAiClient;
import me.vestry.service.BriefingTracing;
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
        @Bean BriefingTracing tracing() { return BriefingTracing.disabled(); }
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
        var restarted = new NewsService(client, cache, mapper, clock, BriefingTracing.disabled());
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
    void acceptsCitedProseAndFiltersUnsafeAndDuplicateCitations() {
        var answer = new OpenAiClient.Response("On September 1 the company announced an October 5 event. That milestone is now four days away.",
                List.of(new OpenAiClient.Citation("https://news.example/story", "Company results"),
                        new OpenAiClient.Citation("javascript:alert(1)", null),
                        new OpenAiClient.Citation("https://user:password@news.example/private", null),
                        new OpenAiClient.Citation("https://news.example/story", "Duplicate")), false, true);
        when(client.generate(any(), anyString(), any())).thenReturn(answer);
        var result = service.getOrFetch(job, List.of("AAPL"));
        assertEquals(Status.READY, result.status());
        assertEquals(1, result.items().size());
        assertEquals("https://news.example/story", result.items().get(0).url());
        assertEquals(answer.text(), result.research());
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
            var valid = response();
            var answer = new OpenAiClient.Response(failure.equals("text") ? "" : valid.text(),
                    failure.equals("sources") ? List.of() : valid.citations(),
                    failure.equals("refusal"), !failure.equals("search"));
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
        when(client.generate(any(), anyString(), any()))
                .thenReturn(new OpenAiClient.Response("NO_RELEVANT_NEWS", List.of(), false, true));
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
                new me.vestry.config.AiConfig.AiLimits(true, 100000, 100000, 5), "test-key", BriefingTracing.disabled());
        var bounded = new NewsService(realClient, cache, mapper, clock, BriefingTracing.disabled());
        long allowance = bounded.allowance(List.of("ABCDEFGHIJ", "KLMNOPQRST", "UVWXYZABCD", "EFGHIJKLMN",
                "OPQRSTUVWX", "YZABCDEFGH", "IJKLMNOPQR", "STUVWXYZAB"));
        assertTrue(allowance <= 20000);
        assertTrue(allowance + 10000 <= 30000);
    }

    private OpenAiClient.Response response() {
        return new OpenAiClient.Response("Company published quarterly results on October 1, 2026.",
                List.of(new OpenAiClient.Citation("https://news.example/story", "Company results")), false, true);
    }
}
