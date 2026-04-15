package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.model.JournalEntry;
import com.github.fabianjim.portfoliomonitor.model.JournalEntryType;
import com.github.fabianjim.portfoliomonitor.model.Stock;
import com.github.fabianjim.portfoliomonitor.model.User;
import com.github.fabianjim.portfoliomonitor.repository.JournalEntryRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

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
    private SecurityContext securityContext;

    @Mock
    private Authentication authentication;

    @InjectMocks
    private JournalEntryService journalEntryService;

    private User mockUser;

    @BeforeEach
    void setUp() {
        mockUser = new User();
        mockUser.setId(1);
        mockUser.setUsername("testuser");

        SecurityContextHolder.setContext(securityContext);
        when(securityContext.getAuthentication()).thenReturn(authentication);
        when(authentication.getPrincipal()).thenReturn(mockUser);
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
}
