package me.vestry.api;

import com.fasterxml.jackson.annotation.JsonFormat;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/** Calls hindsight, the AI service. Vestry must work without it, so nothing here throws. */
@Component
public class HindsightClient {
    private static final Logger log = LoggerFactory.getLogger(HindsightClient.class);

    /** Hindsight's contract caps a request at 200 entry IDs. */
    static final int MAX_BATCH = 200;
    static final int BREAKER_FAILURES = 3;
    static final Duration BREAKER_PAUSE = Duration.ofSeconds(30);
    /** A model call takes seconds and hindsight's own provider timeout is 30 s. */
    static final Duration AID_READ_TIMEOUT = Duration.ofSeconds(45);

    public record Citation(int entryId, String quote) {}
    public record Claim(String summary, List<Citation> citations) {}
    /** Enum-like fields stay strings so a value hindsight adds later can't break parsing. */
    public record EntryInsight(Claim thesis, Claim exitCondition, String horizon, Integer conviction,
                               List<String> emotions, String ideaSource, List<String> tickers, List<String> themes) {}
    record Item(int entryId, EntryInsight insight) {}
    record Page(List<Item> insights) {}

    /** The RestTemplate's mapper writes dates as arrays; hindsight wants ISO text. */
    public record Trade(@JsonFormat(shape = JsonFormat.Shape.STRING) LocalDate day, String type, double shares, double price) {}
    /** What happened after the entry, from vestry's own data. */
    public record Since(Double priceNow, Double sharesNow, List<Trade> trades) {}
    public record ReflectionAid(List<Claim> recap, List<String> questions) {}
    public record AidResult(ReflectionAid aid, LocalDate generatedOn, int remainingToday) {}
    public enum AidStatus { READY, LIMITED, NOT_FOUND, UNAVAILABLE }
    public record AidResponse(AidStatus status, AidResult result) {
        public static AidResponse of(AidStatus status) { return new AidResponse(status, null); }
    }
    record AidRequest(List<Integer> laterEntryIds, Since since) {}
    public record SavedAid(int entryId, ReflectionAid aid, LocalDate generatedOn) {}
    record SavedAidPage(List<SavedAid> aids) {}

    private final RestTemplate http;
    private final RestTemplate aidHttp;
    private final String url;
    private final String token;
    private final Clock clock;
    private final AtomicInteger failures = new AtomicInteger();
    private volatile Instant pausedUntil = Instant.MIN;

    public HindsightClient(@Value("${vestry.hindsight.url:}") String url,
                           @Value("${vestry.hindsight.token:}") String token, Clock clock) {
        this.url = url.strip().replaceAll("/+$", "");
        this.token = token.strip();
        this.clock = clock;
        var transport = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1))
                .followRedirects(HttpClient.Redirect.NEVER).build();
        var factory = new JdkClientHttpRequestFactory(transport);
        factory.setReadTimeout(Duration.ofSeconds(2));
        http = new RestTemplate(factory);
        var aidFactory = new JdkClientHttpRequestFactory(transport);
        aidFactory.setReadTimeout(AID_READ_TIMEOUT);
        aidHttp = new RestTemplate(aidFactory);
    }

    public boolean isEnabled() {
        return !url.isBlank() && !token.isBlank();
    }

    /** Entries without an insight (not processed yet, or AI off) are absent from the result. */
    public Map<Integer, EntryInsight> insights(int userId, Collection<Integer> entryIds) {
        if (!isEnabled() || entryIds.isEmpty()) return Map.of();
        var ids = entryIds.stream().distinct().sorted().toList();
        var found = new HashMap<Integer, EntryInsight>();
        for (int start = 0; start < ids.size() && !paused(); start += MAX_BATCH) {
            fetch(userId, ids.subList(start, Math.min(start + MAX_BATCH, ids.size())), found);
        }
        return found;
    }

    /**
     * Runs on a user's click, so it waits for the model and skips the breaker:
     * the user asked for this answer, and page loads never depend on it.
     */
    public AidResponse reflectionAid(int userId, int entryId, List<Integer> laterEntryIds, Since since) {
        if (!isEnabled()) return AidResponse.of(AidStatus.UNAVAILABLE);
        var uri = UriComponentsBuilder.fromUriString(url).path("/v1/users/{userId}/entries/{entryId}/reflection-aid")
                .buildAndExpand(userId, entryId).toUri();
        var headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));
        try {
            var result = aidHttp.exchange(uri, HttpMethod.POST,
                    new HttpEntity<>(new AidRequest(laterEntryIds, since), headers), AidResult.class).getBody();
            if (result == null || result.aid() == null) throw new IllegalStateException("empty response");
            return new AidResponse(AidStatus.READY, result);
        } catch (RestClientResponseException failure) {
            int status = failure.getStatusCode().value();
            if (status == 429) return AidResponse.of(AidStatus.LIMITED);
            if (status == 404) return AidResponse.of(AidStatus.NOT_FOUND);
            if (status == 401) log.warn("Hindsight rejected the service token (HTTP 401)");
            else log.warn("Hindsight reflection aid request failed: HTTP {}", status);
        } catch (RuntimeException failure) {
            log.warn("Hindsight reflection aid request failed: {}", failure.getClass().getSimpleName());
        }
        return AidResponse.of(AidStatus.UNAVAILABLE);
    }

    /**
     * The newest saved aid per entry, from any day. Never generates, so demo visitors can be shown
     * the template's aids for free. Entries without one, or a failed request, are absent.
     */
    public Map<Integer, SavedAid> savedReflectionAids(int userId, Collection<Integer> entryIds) {
        if (!isEnabled() || entryIds.isEmpty()) return Map.of();
        var ids = entryIds.stream().distinct().sorted().toList();
        var found = new HashMap<Integer, SavedAid>();
        for (int start = 0; start < ids.size(); start += MAX_BATCH) {
            var batch = ids.subList(start, Math.min(start + MAX_BATCH, ids.size()));
            var uri = UriComponentsBuilder.fromUriString(url).path("/v1/users/{userId}/reflection-aids")
                    .queryParam("entryIds", batch.toArray()).buildAndExpand(userId).toUri();
            var headers = new HttpHeaders();
            headers.setBearerAuth(token);
            headers.setAccept(List.of(MediaType.APPLICATION_JSON));
            try {
                var page = http.exchange(uri, HttpMethod.GET, new HttpEntity<>(headers), SavedAidPage.class).getBody();
                if (page == null || page.aids() == null) throw new IllegalStateException("empty response");
                var requested = new HashSet<>(batch);
                for (var saved : page.aids()) {
                    if (saved.aid() != null && requested.contains(saved.entryId())) found.put(saved.entryId(), saved);
                }
            } catch (RestClientResponseException failure) {
                int status = failure.getStatusCode().value();
                if (status == 401) log.warn("Hindsight rejected the service token (HTTP 401)");
                else log.warn("Hindsight saved reflection aids request failed: HTTP {}", status);
            } catch (RuntimeException failure) {
                log.warn("Hindsight saved reflection aids request failed: {}", failure.getClass().getSimpleName());
            }
        }
        return found;
    }

    private void fetch(int userId, List<Integer> ids, Map<Integer, EntryInsight> found) {
        // repeated keys: hindsight rejects a comma-separated list
        var uri = UriComponentsBuilder.fromUriString(url).path("/v1/users/{userId}/insights")
                .queryParam("entryIds", ids.toArray()).buildAndExpand(userId).toUri();
        var headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));
        try {
            var page = http.exchange(uri, HttpMethod.GET, new HttpEntity<>(headers), Page.class).getBody();
            if (page == null || page.insights() == null) throw new IllegalStateException("empty response");
            var requested = new HashSet<>(ids);
            for (var item : page.insights()) {
                if (item.insight() != null && requested.contains(item.entryId())) found.put(item.entryId(), item.insight());
            }
            failures.set(0);
        } catch (RestClientResponseException failure) {
            int status = failure.getStatusCode().value();
            if (status == 401) log.warn("Hindsight rejected the service token (HTTP 401)");
            else log.warn("Hindsight insights request failed: HTTP {}", status);
            failed();
        } catch (RuntimeException failure) {
            log.warn("Hindsight insights request failed: {}", failure.getClass().getSimpleName());
            failed();
        }
    }

    private boolean paused() {
        return clock.instant().isBefore(pausedUntil);
    }

    /** The count only resets on success, so one more failure after a pause pauses again. */
    private void failed() {
        if (failures.incrementAndGet() >= BREAKER_FAILURES) {
            pausedUntil = clock.instant().plus(BREAKER_PAUSE);
            log.warn("Hindsight skipped for {}s after {} failures in a row", BREAKER_PAUSE.toSeconds(), failures.get());
        }
    }
}
