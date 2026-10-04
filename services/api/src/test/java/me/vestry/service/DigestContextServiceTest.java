package me.vestry.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import me.vestry.api.OpenAiClient;
import me.vestry.model.*;
import me.vestry.repository.JournalEntryRepository;
import me.vestry.repository.PortfolioRepository;
import me.vestry.repository.TransactionRepository;
import me.vestry.repository.PortfolioDigestRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DigestContextServiceTest {
    private final DemoSessionResolver users = mock(DemoSessionResolver.class);
    private final PortfolioService portfolios = mock(PortfolioService.class);
    private final JournalEntryRepository journal = mock(JournalEntryRepository.class);
    private final NasdaqMetadataService metadata = mock(NasdaqMetadataService.class);
    private final OpenAiClient client = mock(OpenAiClient.class);
    private final PortfolioRepository savedPortfolios = mock(PortfolioRepository.class);
    private final TransactionRepository transactions = mock(TransactionRepository.class);
    private final PortfolioDigestRepository digests = mock(PortfolioDigestRepository.class);
    private final ObjectMapper mapper = new ObjectMapper();
    private final Instant now = Instant.parse("2026-10-02T12:00:00Z");
    private final DigestContextService service = new DigestContextService(users, portfolios, journal, metadata, client, mapper,
            Clock.fixed(now, ZoneOffset.UTC), savedPortfolios, transactions, digests);
    private final User user = new User("private username", "secret password");

    @BeforeEach
    void setup() {
        user.setId(7);
        when(client.isConfigured()).thenReturn(true);
        when(users.getCurrentUser()).thenReturn(user);
        when(journal.findTop6ByUserIdOrderByTimestampDescIdDesc(7)).thenReturn(List.of());
    }

    @Test
    void usesSavedQuotesAndMetadataAndCapturesImmutablePrivateContext() throws Exception {
        var holding = new Holding("AAPL", 2);
        when(portfolios.getPortfolio()).thenReturn(new Portfolio(user, List.of(holding)));
        var quote = new Stock(); quote.setCurrentPrice(100); quote.setTimestamp(now.minusSeconds(3600));
        when(portfolios.getStockData("AAPL")).thenReturn(quote);
        when(metadata.lookupMetadata("AAPL")).thenReturn(Optional.of(new StockMetadata("AAPL", "Apple", "US", "Technology", "Hardware")));
        var entry = new JournalEntry(); entry.setEntryType(JournalEntryType.INSIGHT); entry.setTimestamp(now);
        entry.setBody("A private reflection about concentration.");
        when(journal.findTop6ByUserIdOrderByTimestampDescIdDesc(7)).thenReturn(List.of(entry));
        var snapshot = service.capture();
        holding.setShares(999); entry.setBody("later edit");
        var body = mapper.readTree(snapshot.json());
        assertEquals(200, body.path("portfolioValue").asDouble());
        assertEquals(100, body.path("holdings").get(0).path("weightPercent").asDouble());
        assertEquals(2, body.path("holdings").get(0).path("shares").asDouble());
        assertTrue(snapshot.json().contains("private reflection"));
        assertFalse(snapshot.json().contains("private username"));
        assertFalse(snapshot.json().contains("secret password"));
        assertFalse(snapshot.json().contains("later edit"));
        assertThrows(UnsupportedOperationException.class, () -> snapshot.tickers().add("MSFT"));
    }

    @Test
    void missingQuotesOmitValuationAndDoNotComputeLifetimePerformance() throws Exception {
        when(portfolios.getPortfolio()).thenReturn(new Portfolio(user, List.of(new Holding("AAPL", 2))));
        var body = mapper.readTree(service.capture().json());
        assertTrue(body.path("portfolioValue").isNull());
        assertFalse(body.has("unrealizedPnl"));
        assertFalse(body.has("totalPnlPercent"));
        verify(portfolios, never()).getPnLSummary();
        assertFalse(body.path("holdings").get(0).has("weightPercent"));
    }

    @Test
    void demoUsesTemplateAndLargeMultilingualJournalsStayBounded() {
        user.setDemo(true);
        var entries = new ArrayList<JournalEntry>();
        for (int i = 0; i < 6; i++) {
            var entry = new JournalEntry(); entry.setEntryType(JournalEntryType.INSIGHT); entry.setTimestamp(now);
            entry.setBody("投資".repeat(1000)); entries.add(entry);
        }
        when(journal.findTop6ByUserIdOrderByTimestampDescIdDesc(7)).thenReturn(entries);
        var snapshot = service.capture();
        assertTrue(snapshot.demo());
        assertTrue(snapshot.json().getBytes(java.nio.charset.StandardCharsets.UTF_8).length < 6600);
        verify(users).getCurrentUser();
        verifyNoMoreInteractions(users); // No demo-session lookup or visitor mutation is read.
        verify(journal).findTop6ByUserIdOrderByTimestampDescIdDesc(7);
    }

    @Test
    void scheduledSnapshotReadsOnlySavedDemoDataWithoutAuthentication() throws Exception {
        user.setDemo(true);
        when(savedPortfolios.findByUserId(7)).thenReturn(Optional.of(new Portfolio(user, List.of(new Holding("AAPL", 2)))));
        var snapshot = service.captureDemo(user);
        assertTrue(snapshot.demo());
        assertEquals(7, snapshot.userId());
        assertEquals(2, mapper.readTree(snapshot.json()).path("holdings").get(0).path("shares").asDouble());
        verifyNoInteractions(users);
        verify(transactions, never()).findByUserIdOrderByTimestampDesc(7);
        verify(portfolios, never()).getPortfolio();
        verify(portfolios, never()).getPnLSummary();
    }

    @Test
    void scheduledSnapshotRejectsPersonalAccountsBeforeReadingData() {
        assertThrows(IllegalArgumentException.class, () -> service.captureDemo(user));
        verifyNoInteractions(users, savedPortfolios, transactions, journal, portfolios);
    }

    @Test
    void usesLastCaptureForActivityAndNeverPassesGeneratedProseAsEvidence() throws Exception {
        var captured = now.minusSeconds(86400);
        var content = mapper.createObjectNode().put("news", "Earlier headline").put("reflection", "Earlier context");
        content.putArray("sources").addObject().put("url", "https://news.example/story");
        content.putArray("questions").addObject().put("text", "Review holdings");
        var previous = new PortfolioDigest(UUID.randomUUID(), 7, captured, captured.plusSeconds(30), content);
        when(digests.findTop3ByUserIdAndCapturedAtLessThanEqualOrderByGeneratedAtDesc(7, now)).thenReturn(List.of(previous));
        var trade = new Transaction("AAPL", 1, 100, Transaction.TransactionType.SELL);
        trade.setTimestamp(now.minusSeconds(3600));
        when(transactions.findTop12ByUserIdAndTimestampGreaterThanAndTimestampLessThanEqualOrderByTimestampDescIdDesc(
                7, captured, now)).thenReturn(List.of(trade));
        var fresh = new JournalEntry(); fresh.setEntryType(JournalEntryType.INSIGHT); fresh.setTimestamp(now);
        fresh.setBody("New reasoning");
        var old = new JournalEntry(); old.setEntryType(JournalEntryType.INSIGHT); old.setTimestamp(now.minus(Duration.ofDays(31)));
        old.setBody("Stale reasoning");
        when(journal.findTop6ByUserIdOrderByTimestampDescIdDesc(7)).thenReturn(List.of(fresh, old));
        var body = mapper.readTree(service.capture().json());
        assertEquals(captured.toString(), body.path("activitySinceExclusive").asText());
        assertEquals("SELL", body.path("recentTransactions").get(0).path("type").asText());
        assertEquals("https://news.example/story", body.path("previousCoverage").get(0).path("sourceUrls").get(0).asText());
        assertEquals("Review holdings", body.path("previousCoverage").get(0).path("nextStep").asText());
        assertFalse(body.toString().contains("Earlier headline"));
        assertFalse(body.toString().contains("Earlier context"));
        assertEquals(1, body.path("journal").size());
        assertTrue(body.path("journal").get(0).path("newSincePreviousBriefing").asBoolean());
        verify(digests).findTop3ByUserIdAndCapturedAtLessThanEqualOrderByGeneratedAtDesc(7, now);
    }

    @Test
    void olderJournalContextIsNotPresentedAsNewAndFutureEntriesAreExcluded() throws Exception {
        var since = now.minusSeconds(86400);
        when(digests.findTop3ByUserIdAndCapturedAtLessThanEqualOrderByGeneratedAtDesc(7, now))
                .thenReturn(List.of(new PortfolioDigest(UUID.randomUUID(), 7, since, since, mapper.createObjectNode())));
        var boundary = new JournalEntry(); boundary.setEntryType(JournalEntryType.INSIGHT); boundary.setTimestamp(since);
        boundary.setBody("Already available at the previous capture");
        var future = new JournalEntry(); future.setEntryType(JournalEntryType.INSIGHT); future.setTimestamp(now.plusSeconds(60));
        when(journal.findTop6ByUserIdOrderByTimestampDescIdDesc(7)).thenReturn(List.of(future, boundary));
        var entries = mapper.readTree(service.capture().json()).path("journal");
        assertEquals(1, entries.size());
        assertFalse(entries.get(0).path("newSincePreviousBriefing").asBoolean());
    }

    @Test
    void firstVisitAndLongAbsencesUseOneWeekWithoutRecyclingOldBriefings() throws Exception {
        var start = now.minus(Duration.ofDays(7));
        var first = mapper.readTree(service.capture().json());
        assertEquals(start.toString(), first.path("activitySinceExclusive").asText());
        var old = now.minus(Duration.ofDays(40));
        when(digests.findTop3ByUserIdAndCapturedAtLessThanEqualOrderByGeneratedAtDesc(7, now))
                .thenReturn(List.of(new PortfolioDigest(UUID.randomUUID(), 7, old, old, mapper.createObjectNode())));
        var returning = mapper.readTree(service.capture().json());
        assertEquals(start.toString(), returning.path("activitySinceExclusive").asText());
        assertTrue(returning.path("previousCoverage").isEmpty());
        verify(transactions, times(2)).findTop12ByUserIdAndTimestampGreaterThanAndTimestampLessThanEqualOrderByTimestampDescIdDesc(7, start, now);
    }

    @Test
    void disabledDoesNotReadPrivateData() {
        when(client.isConfigured()).thenReturn(false);
        assertThrows(IllegalStateException.class, service::capture);
        verifyNoInteractions(users, portfolios, journal, metadata);
    }
}
