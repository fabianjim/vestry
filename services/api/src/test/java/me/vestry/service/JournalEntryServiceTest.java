package me.vestry.service;

import me.vestry.model.JournalEntry;
import me.vestry.model.JournalEntryType;
import me.vestry.model.Stock;
import me.vestry.model.Tag;
import me.vestry.model.Transaction;
import me.vestry.model.User;
import me.vestry.repository.JournalEntryRepository;
import me.vestry.repository.TransactionRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class JournalEntryServiceTest {

    @Mock
    private JournalEntryRepository journalEntryRepository;

    @Mock
    private StockService stockService;

    @Mock
    private TagService tagService;

    @Mock
    private TransactionRepository transactionRepository;

    @Mock
    private SecurityContext securityContext;

    @Mock
    private Authentication authentication;

    @Spy
    private RealizedPnlCalculator realizedPnlCalculator = new RealizedPnlCalculator();

    @InjectMocks
    private JournalEntryService journalEntryService;

    private User mockUser;

    @Test
    void unifiedSearchMatchesBodyOrTickerInListAndCalendar() {
        JournalEntry tickerMatch = new JournalEntry();
        tickerMatch.setTicker("AAPL");
        tickerMatch.setBody("Initial portfolio creation");
        JournalEntry bodyMatch = new JournalEntry();
        bodyMatch.setBody("Watching AAPL earnings");
        JournalEntry unrelated = new JournalEntry();
        unrelated.setBody("Other notes");
        Instant timestamp = Instant.parse("2026-09-10T12:00:00Z");
        for (JournalEntry entry : List.of(tickerMatch, bodyMatch, unrelated)) {
            entry.setTimestamp(timestamp);
        }
        when(journalEntryRepository.findByUserIdOrderByTimestampDesc(mockUser.getId()))
            .thenReturn(List.of(tickerMatch, bodyMatch, unrelated));
        when(journalEntryRepository.findByUserIdAndTimestampBetween(eq(mockUser.getId()), any(), any()))
            .thenReturn(List.of(tickerMatch, bodyMatch, unrelated));
        assertEquals(List.of(tickerMatch, bodyMatch), journalEntryService.getFilteredEntries(null, null, null, null, null, "aapl"));
        var days = journalEntryService.getCalendarEntries(2026, 9, null, null, null, null, null, "aapl");
        assertEquals(1, days.size());
        assertEquals("2026-09-10", days.get(0).getDate());
        assertEquals(2, days.get(0).getCount());
    }

    @Test
    void reflectionInheritsSourceTickerAndCapturesItsOwnSnapshot() {
        JournalEntry source = reflectionSource();
        source.setPriceSnapshot(100.0);
        Stock quote = new Stock();
        quote.setCurrentPrice(125.0);
        when(stockService.getLatestStockData("AAPL")).thenReturn(Optional.of(quote));
        when(journalEntryRepository.save(any())).thenAnswer(call -> call.getArgument(0));
        JournalEntry reflection = newReflection();
        reflection.setTicker("MSFT");
        reflection.setTimestamp(Instant.EPOCH);
        reflection.setPriceSnapshot(999.0);

        JournalEntry saved = journalEntryService.createEntry(reflection, List.of("review"));

        assertEquals(7, saved.getSourceEntryId());
        assertEquals("AAPL", saved.getTicker());
        assertEquals(125.0, saved.getPriceSnapshot());
        assertTrue(saved.getTimestamp().isAfter(Instant.EPOCH));
        assertEquals(100.0, source.getPriceSnapshot());
        verifyNoInteractions(transactionRepository);
        verify(tagService).resolveTags(mockUser, List.of("review"));
    }

    @Test
    void reflectionWithMissingQuoteKeepsNullSnapshot() {
        reflectionSource();
        when(stockService.getLatestStockData("AAPL")).thenReturn(Optional.empty());
        when(journalEntryRepository.save(any())).thenAnswer(call -> call.getArgument(0));
        assertNull(journalEntryService.createEntry(newReflection()).getPriceSnapshot());
    }

    @Test
    void reflectionWithoutTickerDoesNotRequestQuote() {
        reflectionSource().setTicker(null);
        when(journalEntryRepository.save(any())).thenAnswer(call -> call.getArgument(0));
        JournalEntry saved = journalEntryService.createEntry(newReflection());
        assertNull(saved.getTicker());
        assertNull(saved.getPriceSnapshot());
        verifyNoInteractions(stockService);
    }

    @Test
    void reflectionRequiresOwnedSourceAndText() {
        JournalEntry reflection = newReflection();
        reflection.setSourceEntryId(null);
        assertThrows(IllegalArgumentException.class, () -> journalEntryService.createEntry(reflection));
        reflection.setSourceEntryId(7);
        // The owned query also returns empty for another user's entry.
        when(journalEntryRepository.findOwnedEntryForUpdate(7, 1)).thenReturn(Optional.empty());
        assertThrows(IllegalArgumentException.class, () -> journalEntryService.createEntry(reflection));
        reflectionSource();
        reflection.setBody("  ");
        assertThrows(IllegalArgumentException.class, () -> journalEntryService.createEntry(reflection));
        verify(journalEntryRepository, never()).save(any());
    }

    @Test
    void ordinaryEntriesCannotCarrySourceLinks() {
        JournalEntry entry = newReflection();
        entry.setEntryType(JournalEntryType.INSIGHT);
        assertThrows(IllegalArgumentException.class, () -> journalEntryService.createEntry(entry));
        verify(journalEntryRepository, never()).save(any());
    }

    @Test
    void deletingSourceConvertsAllLinkedReflectionsAndPreservesTheirContent() {
        reflectionSource();
        JournalEntry first = newReflection();
        first.setPriceSnapshot(125.0);
        first.setTimestamp(Instant.EPOCH);
        JournalEntry second = newReflection();
        when(journalEntryRepository.findByUserIdAndSourceEntryId(1, 7)).thenReturn(List.of(first, second));

        journalEntryService.deleteEntry(7);

        for (JournalEntry reflection : List.of(first, second)) {
            assertEquals(JournalEntryType.INSIGHT, reflection.getEntryType());
            assertNull(reflection.getSourceEntryId());
            assertEquals("My reflection", reflection.getBody());
        }
        assertEquals(125.0, first.getPriceSnapshot());
        assertEquals(Instant.EPOCH, first.getTimestamp());
        verify(journalEntryRepository).deleteById(7);
    }

    @Test
    void editingReflectionPreservesLinkAndPrice() {
        JournalEntry reflection = newReflection();
        reflection.setUser(mockUser);
        reflection.setPriceSnapshot(125.0);
        when(journalEntryRepository.findById(8)).thenReturn(Optional.of(reflection));
        when(journalEntryRepository.save(any())).thenAnswer(call -> call.getArgument(0));
        JournalEntry saved = journalEntryService.updateEntry(8, "Revised thoughts");
        assertEquals(7, saved.getSourceEntryId());
        assertEquals(125.0, saved.getPriceSnapshot());
        verifyNoInteractions(stockService, transactionRepository);
    }

    @Test
    void entryLookupEnforcesOwnership() {
        JournalEntry source = new JournalEntry();
        User other = new User();
        other.setId(2);
        source.setUser(other);
        when(journalEntryRepository.findById(7)).thenReturn(Optional.of(source));
        assertThrows(IllegalArgumentException.class, () -> journalEntryService.getEntry(7));
        source.setUser(mockUser);
        assertSame(source, journalEntryService.getEntry(7));
    }

    private JournalEntry reflectionSource() {
        JournalEntry source = new JournalEntry();
        source.setId(7);
        source.setTicker("AAPL");
        source.setEntryType(JournalEntryType.BUY);
        source.setUser(mockUser);
        when(journalEntryRepository.findOwnedEntryForUpdate(7, 1)).thenReturn(Optional.of(source));
        return source;
    }

    private JournalEntry newReflection() {
        JournalEntry entry = new JournalEntry();
        entry.setEntryType(JournalEntryType.REFLECTION);
        entry.setSourceEntryId(7);
        entry.setBody("My reflection");
        return entry;
    }

    @BeforeEach
    void setUp() {
        mockUser = new User();
        mockUser.setId(1);
        mockUser.setUsername("testuser");

        SecurityContextHolder.setContext(securityContext);
        lenient().when(securityContext.getAuthentication()).thenReturn(authentication);
        lenient().when(authentication.getPrincipal()).thenReturn(mockUser);
        lenient().when(tagService.resolveTags(any(User.class), any())).thenReturn(new HashSet<>());
    }

    @Test
    void createEntryWithTickerCapturesPriceSnapshot() {
        String ticker = "AAPL";
        double price = 150.0;

        Stock stock = new Stock();
        stock.setTicker(ticker);
        stock.setCurrentPrice(price);

        when(stockService.getLatestStockData(ticker)).thenReturn(Optional.of(stock));
        when(journalEntryRepository.save(any(JournalEntry.class))).thenAnswer(invocation -> {
            JournalEntry e = invocation.getArgument(0);
            e.setId(1);
            return e;
        });

        JournalEntry entry = new JournalEntry();
        entry.setEntryType(JournalEntryType.BUY);
        entry.setBody("Bought AAPL");
        entry.setTicker(ticker);

        JournalEntry result = journalEntryService.createEntry(entry);

        assertNotNull(result);
        assertEquals(price, result.getPriceSnapshot(), 0.01);
        assertEquals(mockUser, result.getUser());
        assertNotNull(result.getTimestamp());

        ArgumentCaptor<JournalEntry> captor = ArgumentCaptor.forClass(JournalEntry.class);
        verify(journalEntryRepository).save(captor.capture());
        assertEquals(price, captor.getValue().getPriceSnapshot(), 0.01);
    }

    @Test
    void createEntryWithoutTickerDoesNotCapturePrice() {
        when(journalEntryRepository.save(any(JournalEntry.class))).thenAnswer(invocation -> {
            JournalEntry e = invocation.getArgument(0);
            e.setId(1);
            return e;
        });

        JournalEntry entry = new JournalEntry();
        entry.setEntryType(JournalEntryType.MARKET_EVENT);
        entry.setBody("Fed announcement");
        entry.setTicker(null);

        JournalEntry result = journalEntryService.createEntry(entry);

        assertNotNull(result);
        assertNull(result.getPriceSnapshot());
        verify(stockService, never()).getLatestStockData(any());
    }

    @Test
    void createEntryWhenStockNotFoundSetsZeroPriceSnapshot() {
        String ticker = "UNKNOWN";
        when(stockService.getLatestStockData(ticker)).thenReturn(Optional.empty());
        when(journalEntryRepository.save(any(JournalEntry.class))).thenAnswer(invocation -> {
            JournalEntry e = invocation.getArgument(0);
            e.setId(1);
            return e;
        });

        JournalEntry entry = new JournalEntry();
        entry.setEntryType(JournalEntryType.INSIGHT);
        entry.setBody("Insight on unknown");
        entry.setTicker(ticker);

        JournalEntry result = journalEntryService.createEntry(entry);

        assertEquals(0.0, result.getPriceSnapshot(), 0.01);
    }

    @Test
    void createSellEntryWithProfitAddsWinTag() {
        String ticker = "AAPL";
        when(journalEntryRepository.save(any(JournalEntry.class))).thenAnswer(invocation -> {
            JournalEntry e = invocation.getArgument(0);
            e.setId(1);
            return e;
        });
        when(transactionRepository.findByUserIdAndTicker(mockUser.getId(), ticker))
            .thenReturn(List.of(
                createTransaction(ticker, 10, 100.0, Transaction.TransactionType.BUY),
                createTransaction(ticker, 5, 120.0, Transaction.TransactionType.SELL)
            ));

        JournalEntry entry = new JournalEntry();
        entry.setEntryType(JournalEntryType.SELL);
        entry.setBody("Sold AAPL");
        entry.setTicker(ticker);
        entry.setPriceSnapshot(120.0);

        journalEntryService.createEntry(entry);

        ArgumentCaptor<List<String>> tagCaptor = ArgumentCaptor.forClass(List.class);
        verify(tagService).resolveTags(eq(mockUser), tagCaptor.capture());
        assertTrue(tagCaptor.getValue().contains("win"));
    }

    @Test
    void createSellEntryWithLossAddsLossTag() {
        String ticker = "AAPL";
        when(journalEntryRepository.save(any(JournalEntry.class))).thenAnswer(invocation -> {
            JournalEntry e = invocation.getArgument(0);
            e.setId(1);
            return e;
        });
        when(transactionRepository.findByUserIdAndTicker(mockUser.getId(), ticker))
            .thenReturn(List.of(
                createTransaction(ticker, 10, 100.0, Transaction.TransactionType.BUY),
                createTransaction(ticker, 5, 80.0, Transaction.TransactionType.SELL)
            ));

        JournalEntry entry = new JournalEntry();
        entry.setEntryType(JournalEntryType.SELL);
        entry.setBody("Sold AAPL");
        entry.setTicker(ticker);
        entry.setPriceSnapshot(80.0);

        journalEntryService.createEntry(entry);

        ArgumentCaptor<List<String>> tagCaptor = ArgumentCaptor.forClass(List.class);
        verify(tagService).resolveTags(eq(mockUser), tagCaptor.capture());
        assertTrue(tagCaptor.getValue().contains("loss"));
    }

    @Test
    void createSellEntryWithNoTransactionsDoesNotAddAutoTag() {
        String ticker = "AAPL";
        when(journalEntryRepository.save(any(JournalEntry.class))).thenAnswer(invocation -> {
            JournalEntry e = invocation.getArgument(0);
            e.setId(1);
            return e;
        });
        when(transactionRepository.findByUserIdAndTicker(mockUser.getId(), ticker))
            .thenReturn(List.of());

        JournalEntry entry = new JournalEntry();
        entry.setEntryType(JournalEntryType.SELL);
        entry.setBody("Sold AAPL");
        entry.setTicker(ticker);
        entry.setPriceSnapshot(120.0);

        journalEntryService.createEntry(entry);

        ArgumentCaptor<List<String>> tagCaptor = ArgumentCaptor.forClass(List.class);
        verify(tagService).resolveTags(eq(mockUser), tagCaptor.capture());
        assertFalse(tagCaptor.getValue().contains("win"));
        assertFalse(tagCaptor.getValue().contains("loss"));
    }

    private Transaction createTransaction(String ticker, double shares, double price, Transaction.TransactionType type) {
        Transaction tx = new Transaction(ticker, shares, price, type);
        tx.setTotalValue(shares * price);
        tx.setUser(mockUser);
        return tx;
    }

    @Test
    void createInitialEntryPersistsBuyEntryWithoutTags() {
        String ticker = "AAPL";
        double price = 150.0;
        Instant timestamp = Instant.now();
        when(journalEntryRepository.save(any(JournalEntry.class))).thenAnswer(invocation -> invocation.getArgument(0));

        JournalEntry result = journalEntryService.createInitialEntry(mockUser, ticker, price, timestamp);

        assertEquals(JournalEntryType.BUY, result.getEntryType());
        assertEquals("Initial portfolio creation", result.getBody());
        assertEquals(ticker, result.getTicker());
        assertEquals(timestamp, result.getTimestamp());
        assertEquals(price, result.getPriceSnapshot(), 0.001);
        assertEquals(mockUser, result.getUser());
        assertTrue(result.getTags().isEmpty());

        verify(tagService, never()).resolveTags(any(User.class), any());
        verify(journalEntryRepository).save(any(JournalEntry.class));
    }

    @Test
    void createAutoSellEntryAddsWinTagAndPersists() {
        String ticker = "AAPL";
        when(journalEntryRepository.save(any(JournalEntry.class))).thenAnswer(invocation -> {
            JournalEntry e = invocation.getArgument(0);
            e.setId(1);
            return e;
        });
        when(transactionRepository.findByUserIdAndTicker(mockUser.getId(), ticker))
            .thenReturn(List.of(createTransaction(ticker, 10, 100.0, Transaction.TransactionType.BUY)));

        JournalEntry result = journalEntryService.createAutoSellEntry(mockUser, ticker, 5, 120.0, Instant.now());

        assertEquals(JournalEntryType.SELL, result.getEntryType());
        assertEquals(ticker, result.getTicker());
        assertEquals(120.0, result.getPriceSnapshot(), 0.001);
        assertEquals(mockUser, result.getUser());

        ArgumentCaptor<List<String>> tagCaptor = ArgumentCaptor.forClass(List.class);
        verify(tagService).resolveTags(eq(mockUser), tagCaptor.capture());
        assertEquals(List.of("win"), tagCaptor.getValue());
        verify(journalEntryRepository).save(any(JournalEntry.class));
    }

    @Test
    void createAutoSellEntryWithLossAddsLossTag() {
        String ticker = "AAPL";
        when(journalEntryRepository.save(any(JournalEntry.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(transactionRepository.findByUserIdAndTicker(mockUser.getId(), ticker))
            .thenReturn(List.of(createTransaction(ticker, 10, 100.0, Transaction.TransactionType.BUY)));

        journalEntryService.createAutoSellEntry(mockUser, ticker, 5, 80.0, Instant.now());

        ArgumentCaptor<List<String>> tagCaptor = ArgumentCaptor.forClass(List.class);
        verify(tagService).resolveTags(eq(mockUser), tagCaptor.capture());
        assertEquals(List.of("loss"), tagCaptor.getValue());
    }

    @Test
    void updateEntryPreservesAutoWinTag() {
        String ticker = "AAPL";
        JournalEntry existing = new JournalEntry();
        existing.setId(7);
        existing.setEntryType(JournalEntryType.SELL);
        existing.setBody("Sold AAPL");
        existing.setTicker(ticker);
        existing.setTimestamp(Instant.now());
        existing.setPriceSnapshot(120.0);
        existing.setUser(mockUser);

        Transaction buy = createTransaction(ticker, 10, 100.0, Transaction.TransactionType.BUY);
        buy.setTimestamp(Instant.now().minusSeconds(7200));
        Transaction sell = createTransaction(ticker, 5, 120.0, Transaction.TransactionType.SELL);
        sell.setTimestamp(Instant.now().minusSeconds(3600));

        when(journalEntryRepository.findById(7)).thenReturn(Optional.of(existing));
        when(journalEntryRepository.save(any(JournalEntry.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(transactionRepository.findByUserIdAndTicker(mockUser.getId(), ticker))
            .thenReturn(List.of(buy, sell));

        journalEntryService.updateEntry(7, "Updated note", List.of());

        ArgumentCaptor<List<String>> tagCaptor = ArgumentCaptor.forClass(List.class);
        verify(tagService).resolveTags(eq(mockUser), tagCaptor.capture());
        assertTrue(tagCaptor.getValue().contains("win"));
    }

    @Test
    void getEntriesForUser() {
        JournalEntry e1 = new JournalEntry();
        e1.setEntryType(JournalEntryType.BUY);
        when(journalEntryRepository.findByUserIdOrderByTimestampDesc(mockUser.getId()))
            .thenReturn(List.of(e1));

        List<JournalEntry> result = journalEntryService.getEntriesForUser();
        assertEquals(1, result.size());
        verify(journalEntryRepository).findByUserIdOrderByTimestampDesc(mockUser.getId());
    }

    @Test
    void getEntriesForUserAndTicker() {
        String ticker = "AAPL";
        JournalEntry e1 = new JournalEntry();
        e1.setTicker(ticker);
        when(journalEntryRepository.findByUserIdAndTicker(mockUser.getId(), ticker))
            .thenReturn(List.of(e1));

        List<JournalEntry> result = journalEntryService.getEntriesForUserAndTicker(ticker);
        assertEquals(1, result.size());
        assertEquals(ticker, result.get(0).getTicker());
    }

    @Test
    void getEntriesInRange() {
        Instant from = Instant.now().minusSeconds(3600);
        Instant to = Instant.now();
        JournalEntry e1 = new JournalEntry();
        when(journalEntryRepository.findByUserIdAndTimestampBetween(mockUser.getId(), from, to))
            .thenReturn(List.of(e1));

        List<JournalEntry> result = journalEntryService.getEntriesInRange(from, to);
        assertEquals(1, result.size());
    }

    @Test
    void deleteEntrySuccess() {
        JournalEntry entry = new JournalEntry();
        entry.setId(1);
        entry.setUser(mockUser);
        when(journalEntryRepository.findOwnedEntryForUpdate(1, mockUser.getId())).thenReturn(Optional.of(entry));

        journalEntryService.deleteEntry(1);

        verify(journalEntryRepository).deleteById(1);
    }

    @Test
    void deleteEntryNotFound() {
        when(journalEntryRepository.findOwnedEntryForUpdate(1, mockUser.getId())).thenReturn(Optional.empty());

        RuntimeException exception = assertThrows(RuntimeException.class, () -> {
            journalEntryService.deleteEntry(1);
        });
        assertEquals("Journal entry not found", exception.getMessage());
    }

    @Test
    void deleteEntryWrongUser() {
        User otherUser = new User();
        otherUser.setId(2);
        otherUser.setUsername("otheruser");

        JournalEntry entry = new JournalEntry();
        entry.setId(1);
        entry.setUser(otherUser);
        when(journalEntryRepository.findOwnedEntryForUpdate(1, mockUser.getId())).thenReturn(Optional.of(entry));

        RuntimeException exception = assertThrows(RuntimeException.class, () -> {
            journalEntryService.deleteEntry(1);
        });
        assertEquals("Journal entry not found", exception.getMessage());
    }

    @Test
    void updateEntrySuccess() {
        JournalEntry entry = new JournalEntry();
        entry.setId(1);
        entry.setBody("Original body");
        entry.setUser(mockUser);
        when(journalEntryRepository.findById(1)).thenReturn(Optional.of(entry));
        when(journalEntryRepository.save(any(JournalEntry.class))).thenAnswer(invocation -> invocation.getArgument(0));

        JournalEntry result = journalEntryService.updateEntry(1, "Updated body");

        assertEquals("Updated body", result.getBody());
        verify(journalEntryRepository).save(entry);
    }

    @Test
    void updateEntryNotFound() {
        when(journalEntryRepository.findById(1)).thenReturn(Optional.empty());

        RuntimeException exception = assertThrows(RuntimeException.class, () -> {
            journalEntryService.updateEntry(1, "Updated body");
        });
        assertEquals("Journal entry not found", exception.getMessage());
    }

    @Test
    void updateEntryWrongUser() {
        User otherUser = new User();
        otherUser.setId(2);
        otherUser.setUsername("otheruser");

        JournalEntry entry = new JournalEntry();
        entry.setId(1);
        entry.setBody("Original body");
        entry.setUser(otherUser);
        when(journalEntryRepository.findById(1)).thenReturn(Optional.of(entry));

        RuntimeException exception = assertThrows(RuntimeException.class, () -> {
            journalEntryService.updateEntry(1, "Updated body");
        });
        assertEquals("Journal entry not found", exception.getMessage());
    }
}
