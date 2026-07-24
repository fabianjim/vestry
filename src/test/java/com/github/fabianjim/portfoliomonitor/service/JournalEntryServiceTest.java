package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.model.JournalEntry;
import com.github.fabianjim.portfoliomonitor.model.JournalEntryType;
import com.github.fabianjim.portfoliomonitor.model.Stock;
import com.github.fabianjim.portfoliomonitor.model.Tag;
import com.github.fabianjim.portfoliomonitor.model.Transaction;
import com.github.fabianjim.portfoliomonitor.model.User;
import com.github.fabianjim.portfoliomonitor.repository.JournalEntryRepository;
import com.github.fabianjim.portfoliomonitor.repository.TransactionRepository;

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
        when(journalEntryRepository.findById(1)).thenReturn(Optional.of(entry));

        journalEntryService.deleteEntry(1);

        verify(journalEntryRepository).deleteById(1);
    }

    @Test
    void deleteEntryNotFound() {
        when(journalEntryRepository.findById(1)).thenReturn(Optional.empty());

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
        when(journalEntryRepository.findById(1)).thenReturn(Optional.of(entry));

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
