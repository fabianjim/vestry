package me.vestry.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import me.vestry.api.OpenAiClient;
import me.vestry.dto.PnLSummaryDTO;
import me.vestry.model.*;
import me.vestry.repository.JournalEntryRepository;
import me.vestry.repository.PortfolioRepository;
import me.vestry.repository.TransactionRepository;
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
    private final ObjectMapper mapper = new ObjectMapper();
    private final Instant now = Instant.parse("2026-10-02T12:00:00Z");
    private final DigestContextService service = new DigestContextService(users, portfolios, journal, metadata, client, mapper,
            Clock.fixed(now, ZoneOffset.UTC), savedPortfolios, transactions);
    private final User user = new User("private username", "secret password");

    @BeforeEach
    void setup() {
        user.setId(7);
        when(client.isConfigured()).thenReturn(true);
        when(users.getCurrentUser()).thenReturn(user);
        when(portfolios.getPnLSummary()).thenReturn(new PnLSummaryDTO(40, 10, 25, 5, 15, 3));
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
    void missingQuotesOmitValuationAndUnrealizedMetricsButKeepRealizedResults() throws Exception {
        when(portfolios.getPortfolio()).thenReturn(new Portfolio(user, List.of(new Holding("AAPL", 2))));
        var body = mapper.readTree(service.capture().json());
        assertTrue(body.path("portfolioValue").isNull());
        assertTrue(body.path("unrealizedPnl").isNull());
        assertTrue(body.path("totalPnlPercent").isNull());
        assertEquals(15, body.path("realizedPnl").asDouble());
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
        when(portfolios.calculatePnLSummary(List.of())).thenReturn(new PnLSummaryDTO(40, 10, 25, 5, 15, 3));
        var snapshot = service.captureDemo(user);
        assertTrue(snapshot.demo());
        assertEquals(7, snapshot.userId());
        assertEquals(2, mapper.readTree(snapshot.json()).path("holdings").get(0).path("shares").asDouble());
        verifyNoInteractions(users);
        verify(transactions).findByUserIdOrderByTimestampDesc(7);
        verify(portfolios, never()).getPortfolio();
        verify(portfolios, never()).getPnLSummary();
    }

    @Test
    void scheduledSnapshotRejectsPersonalAccountsBeforeReadingData() {
        assertThrows(IllegalArgumentException.class, () -> service.captureDemo(user));
        verifyNoInteractions(users, savedPortfolios, transactions, journal, portfolios);
    }

    @Test
    void disabledDoesNotReadPrivateData() {
        when(client.isConfigured()).thenReturn(false);
        assertThrows(IllegalStateException.class, service::capture);
        verifyNoInteractions(users, portfolios, journal, metadata);
    }
}
