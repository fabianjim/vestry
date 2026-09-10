package me.vestry.service;

import me.vestry.exception.PriceFetchException;
import me.vestry.exception.UnknownTickerException;
import me.vestry.model.Holding;
import me.vestry.model.JournalEntry;
import me.vestry.model.Portfolio;
import me.vestry.model.Stock;
import me.vestry.model.Transaction;
import me.vestry.model.Transaction.TransactionType;
import me.vestry.model.TrackedStock;
import me.vestry.model.User;
import me.vestry.repository.PortfolioRepository;
import me.vestry.repository.StockRepository;
import me.vestry.repository.TrackedStockRepository;
import me.vestry.repository.UserRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.ArrayList;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.isNull;

@ExtendWith(MockitoExtension.class)
public class PortfolioServiceTransactionTest {

    @Mock
    private PortfolioRepository portfolioRepository;

    @Mock
    private StockRepository stockRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private TrackedStockRepository trackedStockRepository;

    @Mock
    private StockService stockService;

    @Mock
    private TransactionService transactionService;

    @Mock
    private JournalEntryService journalEntryService;

    @Mock
    private SecurityContext securityContext;

    @Mock
    private Authentication authentication;

    private PortfolioService portfolioService;

    private User mockUser;
    private Portfolio mockPortfolio;

    @BeforeEach
    void setUp() {
        portfolioService = new PortfolioService(portfolioRepository, stockService,
            new TrackedStockService(trackedStockRepository), userRepository, trackedStockRepository,
            stockRepository, transactionService, journalEntryService);
        mockUser = new User();
        mockUser.setId(1);
        mockUser.setUsername("testuser");

        mockPortfolio = new Portfolio();
        mockPortfolio.setId(1);
        mockPortfolio.setUser(mockUser);
        mockPortfolio.setHoldings(new ArrayList<>());

        SecurityContextHolder.setContext(securityContext);
        when(securityContext.getAuthentication()).thenReturn(authentication);
        when(authentication.getPrincipal()).thenReturn(mockUser);
    }

    @Test
    void rejectsNewTickerAtLimitWithoutSideEffects() {
        fillHoldings(8);
        when(portfolioRepository.findByUserIdForUpdate(1)).thenReturn(Optional.of(mockPortfolio));

        assertThrows(IllegalArgumentException.class,
            () -> portfolioService.addHolding("NEW", 1, 100.0, null));

        assertEquals(8, mockPortfolio.getHoldings().size());
        verifyNoInteractions(stockService, trackedStockRepository, transactionService, journalEntryService);
        verify(portfolioRepository, never()).save(any());
    }

    @Test
    void allowsEighthTicker() {
        fillHoldings(7);
        when(portfolioRepository.findByUserIdForUpdate(1)).thenReturn(Optional.of(mockPortfolio));

        portfolioService.addHolding("NEW", 1, 100.0, null);

        assertEquals(8, mockPortfolio.getHoldings().size());
        verify(transactionService).recordBuyTransaction("NEW", 1, 100.0, null);
    }

    @Test
    void allowsExistingTickerAtAndAboveLimit() {
        fillHoldings(8);
        when(portfolioRepository.findByUserIdForUpdate(1)).thenReturn(Optional.of(mockPortfolio));
        portfolioService.addHolding("T0", 2, 100.0, null);
        assertEquals(3, mockPortfolio.getHoldings().get(0).getShares());
        mockPortfolio.getHoldings().add(new Holding("LEGACY", 1));
        portfolioService.addHolding("T0", 2, 100.0, null);
        assertEquals(5, mockPortfolio.getHoldings().get(0).getShares());
        assertThrows(IllegalArgumentException.class,
            () -> portfolioService.addHolding("NEW", 1, 100.0, null));
        assertEquals(9, mockPortfolio.getHoldings().size());
    }

    @Test
    void onlyFullSaleFreesSlot() {
        fillHoldings(8);
        mockPortfolio.getHoldings().get(0).setShares(2);
        when(portfolioRepository.findByUserIdForUpdate(1)).thenReturn(Optional.of(mockPortfolio));
        portfolioService.sellHolding("T0", 1, 100.0, null);
        assertThrows(IllegalArgumentException.class,
            () -> portfolioService.addHolding("NEW", 1, 100.0, null));
        portfolioService.sellHolding("T0", 1, 100.0, null);
        portfolioService.addHolding("NEW", 1, 100.0, null);
        assertEquals(8, mockPortfolio.getHoldings().size());
        assertTrue(mockPortfolio.getHoldings().stream().noneMatch(h -> h.getTicker().equals("T0")));
    }

    @Test
    void removingHoldingFreesSlot() {
        fillHoldings(8);
        when(portfolioRepository.findByUserIdForUpdate(1)).thenReturn(Optional.of(mockPortfolio));
        portfolioService.removeHolding("T0", 100.0, null);
        portfolioService.addHolding("NEW", 1, 100.0, null);
        assertEquals(8, mockPortfolio.getHoldings().size());
    }

    @Test
    void zeroShareHoldingStillCountsTowardLimit() {
        fillHoldings(8);
        mockPortfolio.getHoldings().get(0).setShares(0);
        when(portfolioRepository.findByUserIdForUpdate(1)).thenReturn(Optional.of(mockPortfolio));
        assertThrows(IllegalArgumentException.class,
            () -> portfolioService.addHolding("NEW", 1, 100.0, null));
    }

    private void fillHoldings(int count) {
        for (int i = 0; i < count; i++) {
            mockPortfolio.getHoldings().add(new Holding("T" + i, 1));
        }
    }

    @Test
    void addHoldingRecordsBuyTransaction() {      
        String ticker = "AAPL";
        double shares = 10.0;
        double currentPrice = 150.0;

        when(portfolioRepository.findByUserIdForUpdate(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockService.updateStockData(ticker, Stock.StockType.INITIAL))
            .thenReturn(createStock(ticker, currentPrice));
        when(portfolioRepository.save(any(Portfolio.class))).thenReturn(mockPortfolio);
        when(transactionService.recordBuyTransaction(eq(ticker), eq(shares), eq(currentPrice), isNull()))
            .thenReturn(createTransaction(ticker, shares, currentPrice, TransactionType.BUY));
      
        portfolioService.addHolding(ticker, shares);
   
        verify(stockService).updateStockData(ticker, Stock.StockType.INITIAL);
        verify(transactionService).recordBuyTransaction(ticker, shares, currentPrice, null);
    }

    @Test
    void removeHoldingRecordsSellTransaction() {       
        String ticker = "GOOGL";
        double shares = 5.0;
        double currentPrice = 200.0;

        Holding holding = new Holding(ticker, shares);
        mockPortfolio.getHoldings().add(holding);

        when(portfolioRepository.findByUserIdForUpdate(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockService.updateStockData(ticker, Stock.StockType.INITIAL))
            .thenReturn(createStock(ticker, currentPrice));
        when(transactionService.recordSellTransaction(eq(ticker), eq(shares), eq(currentPrice), isNull()))
            .thenReturn(createTransaction(ticker, shares, currentPrice, TransactionType.SELL));
     
        portfolioService.removeHolding(ticker);

        verify(stockService).updateStockData(ticker, Stock.StockType.INITIAL);
        verify(transactionService).recordSellTransaction(ticker, shares, currentPrice, null);
    }

    @Test
    void sellHoldingRecordsSellTransactionWithLivePrice() {   
        String ticker = "MSFT";
        double sharesOwned = 10.0;
        double sharesToSell = 3.0;
        double currentPrice = 250.0;

        Holding holding = new Holding(ticker, sharesOwned);
        mockPortfolio.getHoldings().add(holding);

        when(portfolioRepository.findByUserIdForUpdate(1)).thenReturn(Optional.of(mockPortfolio));
        when(portfolioRepository.save(any(Portfolio.class))).thenReturn(mockPortfolio);
        when(stockService.updateStockData(ticker, Stock.StockType.INITIAL))
            .thenReturn(createStock(ticker, currentPrice));
        when(transactionService.recordSellTransaction(eq(ticker), eq(sharesToSell), eq(currentPrice), isNull()))
            .thenReturn(createTransaction(ticker, sharesToSell, currentPrice, TransactionType.SELL));
   
        portfolioService.sellHolding(ticker, sharesToSell);

        verify(stockService).updateStockData(ticker, Stock.StockType.INITIAL);
        verify(transactionService).recordSellTransaction(ticker, sharesToSell, currentPrice, null);
        assertEquals(sharesOwned - sharesToSell, holding.getShares());
    }

    @Test
    void sellHoldingCreatesAutoJournalEntryBeforeRecordingTransaction() {
        String ticker = "MSFT";
        double sharesOwned = 10.0;
        double sharesToSell = 3.0;
        double currentPrice = 250.0;

        Holding holding = new Holding(ticker, sharesOwned);
        mockPortfolio.getHoldings().add(holding);

        JournalEntry autoEntry = new JournalEntry();
        autoEntry.setId(42);

        when(portfolioRepository.findByUserIdForUpdate(1)).thenReturn(Optional.of(mockPortfolio));
        when(portfolioRepository.save(any(Portfolio.class))).thenReturn(mockPortfolio);
        when(stockService.updateStockData(ticker, Stock.StockType.INITIAL))
            .thenReturn(createStock(ticker, currentPrice));
        when(journalEntryService.createAutoSellEntry(eq(mockUser), eq(ticker), eq(sharesToSell), eq(currentPrice), isNull()))
            .thenReturn(autoEntry);

        JournalEntry result = portfolioService.sellHolding(ticker, sharesToSell);

        assertSame(autoEntry, result);
        var inOrder = org.mockito.Mockito.inOrder(journalEntryService, transactionService);
        inOrder.verify(journalEntryService).createAutoSellEntry(mockUser, ticker, sharesToSell, currentPrice, null);
        inOrder.verify(transactionService).recordSellTransaction(ticker, sharesToSell, currentPrice, null);
    }

    @Test
    void removeHoldingCreatesAutoJournalEntry() {
        String ticker = "GOOGL";
        double shares = 5.0;
        double currentPrice = 200.0;

        Holding holding = new Holding(ticker, shares);
        mockPortfolio.getHoldings().add(holding);

        JournalEntry autoEntry = new JournalEntry();
        autoEntry.setId(43);

        when(portfolioRepository.findByUserIdForUpdate(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockService.updateStockData(ticker, Stock.StockType.INITIAL))
            .thenReturn(createStock(ticker, currentPrice));
        when(journalEntryService.createAutoSellEntry(eq(mockUser), eq(ticker), eq(shares), eq(currentPrice), isNull()))
            .thenReturn(autoEntry);

        JournalEntry result = portfolioService.removeHolding(ticker);

        assertSame(autoEntry, result);
        verify(journalEntryService).createAutoSellEntry(mockUser, ticker, shares, currentPrice, null);
    }

    private Stock createStock(String ticker, double price) {
        Stock stock = new Stock();
        stock.setTicker(ticker);
        stock.setCurrentPrice(price);
        return stock;
    }

    @Test
    void addHoldingToExistingTickerAggregatesShares() {    
        String ticker = "AAPL";
        double initialShares = 10.0;
        double additionalShares = 5.0;
        double currentPrice = 150.0;

        Holding existingHolding = new Holding(ticker, initialShares);
        mockPortfolio.getHoldings().add(existingHolding);

        when(portfolioRepository.findByUserIdForUpdate(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockService.updateStockData(ticker, Stock.StockType.INITIAL))
            .thenReturn(createStock(ticker, currentPrice));
        when(portfolioRepository.save(any(Portfolio.class))).thenReturn(mockPortfolio);
        when(transactionService.recordBuyTransaction(eq(ticker), eq(additionalShares), eq(currentPrice), isNull()))
            .thenReturn(createTransaction(ticker, additionalShares, currentPrice, TransactionType.BUY));
      
        portfolioService.addHolding(ticker, additionalShares);
  
        assertEquals(1, mockPortfolio.getHoldings().size());
        assertEquals(initialShares + additionalShares, mockPortfolio.getHoldings().get(0).getShares());
        verify(transactionService).recordBuyTransaction(ticker, additionalShares, currentPrice, null);
    }

    private Transaction createTransaction(String ticker, double shares, double price, TransactionType type) {
        Transaction transaction = new Transaction(ticker, shares, price, type);
        transaction.setId(1);
        return transaction;
    }

    @Test
    void addHoldingWithUnknownTickerDoesNotRetry() {
        String ticker = "NIKE";
        double shares = 10.0;

        when(portfolioRepository.findByUserIdForUpdate(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockService.updateStockData(ticker, Stock.StockType.INITIAL))
            .thenThrow(new UnknownTickerException(ticker));

        UnknownTickerException exception = assertThrows(UnknownTickerException.class, () -> {
            portfolioService.addHolding(ticker, shares);
        });

        assertEquals("Ticker 'NIKE' does not exist. Please check the symbol and try again.", exception.getMessage());
        verify(stockService, times(1)).updateStockData(ticker, Stock.StockType.INITIAL);
    }

    @Test
    void addHoldingWithPriceFetchExceptionRetriesOnce() {
        String ticker = "AAPL";
        double shares = 10.0;
        double currentPrice = 150.0;

        when(portfolioRepository.findByUserIdForUpdate(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockService.updateStockData(ticker, Stock.StockType.INITIAL))
            .thenThrow(new PriceFetchException(ticker, "API timeout"))
            .thenReturn(createStock(ticker, currentPrice));
        when(portfolioRepository.save(any(Portfolio.class))).thenReturn(mockPortfolio);
        when(transactionService.recordBuyTransaction(eq(ticker), eq(shares), eq(currentPrice), isNull()))
            .thenReturn(createTransaction(ticker, shares, currentPrice, TransactionType.BUY));

        portfolioService.addHolding(ticker, shares);

        verify(stockService, times(2)).updateStockData(ticker, Stock.StockType.INITIAL);
        verify(transactionService).recordBuyTransaction(ticker, shares, currentPrice, null);
    }

    @Test
    void addHoldingUpdatesTrackedStockTimestamps() {
        String ticker = "AAPL";
        double shares = 10.0;
        double currentPrice = 150.0;
        TrackedStock tracked = new TrackedStock(ticker);

        when(portfolioRepository.findByUserIdForUpdate(1)).thenReturn(Optional.of(mockPortfolio));
        when(stockService.updateStockData(ticker, Stock.StockType.INITIAL))
            .thenReturn(createStock(ticker, currentPrice));
        when(portfolioRepository.save(any(Portfolio.class))).thenReturn(mockPortfolio);
        when(transactionService.recordBuyTransaction(eq(ticker), eq(shares), eq(currentPrice), isNull()))
            .thenReturn(createTransaction(ticker, shares, currentPrice, TransactionType.BUY));
        when(trackedStockRepository.findByTicker(ticker)).thenReturn(Optional.of(tracked));

        portfolioService.addHolding(ticker, shares);

        assertNotNull(tracked.getLastFetchAttempt(), "lastFetchAttempt should be set");
        assertNotNull(tracked.getLastSuccessfulFetch(), "lastSuccessfulFetch should be set");
        assertFalse(tracked.isStale(), "Data should not be stale immediately after fetch");
        verify(trackedStockRepository, times(2)).save(tracked);
    }
}
