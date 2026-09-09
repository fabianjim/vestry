package me.vestry.service;

import me.vestry.exception.UnknownTickerException;
import me.vestry.model.Portfolio;
import me.vestry.model.User;
import me.vestry.repository.PortfolioRepository;
import me.vestry.repository.TrackedStockRepository;
import me.vestry.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@DataJpaTest
@ActiveProfiles("test")
@Import({PortfolioService.class, TrackedStockService.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class PortfolioTrackingPersistenceTest {
    @Autowired private PortfolioService portfolioService;
    @Autowired private PortfolioRepository portfolioRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private TrackedStockRepository trackedStockRepository;
    @Autowired private PlatformTransactionManager transactionManager;
    @MockitoBean private StockService stockService;
    @MockitoBean private TransactionService transactionService;
    @MockitoBean private JournalEntryService journalEntryService;

    private User user;
    private String ticker;

    @BeforeEach
    void setUp() {
        ticker = "T" + UUID.randomUUID();
        user = createUserWithPortfolio();
        authenticate(user);
    }

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void repeatedBuysAndPartialSellKeepOneOwnerUntilFullLiquidation() {
        portfolioService.addHolding(ticker, 2, 100.0, null);
        portfolioService.addHolding(ticker, 3, 100.0, null);
        assertEquals(1, trackedStockRepository.findByTicker(ticker).orElseThrow().getHolderCount());

        portfolioService.sellHolding(ticker, 1, 100.0, null);
        assertEquals(1, trackedStockRepository.findByTicker(ticker).orElseThrow().getHolderCount());

        portfolioService.sellHolding(ticker, 4, 100.0, null);
        assertFalse(trackedStockRepository.existsByTicker(ticker));
        assertFalse(trackedStockRepository.findAllActiveTickers().contains(ticker));
    }

    @Test
    void releasingOnePortfolioPreservesAnotherOwnersDemand() {
        portfolioService.addHolding(ticker, 1, 100.0, null);
        User secondUser = createUserWithPortfolio();
        authenticate(secondUser);
        portfolioService.addHolding(ticker, 1, 100.0, null);
        assertEquals(2, trackedStockRepository.findByTicker(ticker).orElseThrow().getHolderCount());

        portfolioService.removeHolding(ticker, 100.0, null);
        assertEquals(1, trackedStockRepository.findByTicker(ticker).orElseThrow().getHolderCount());
        assertTrue(trackedStockRepository.findAllActiveTickers().contains(ticker));

        authenticate(user);
        portfolioService.removeHolding(ticker, 100.0, null);
        assertFalse(trackedStockRepository.existsByTicker(ticker));
    }

    @Test
    void failedFetchRollsBackNewRegistrationAndLeavesHoldingsEmpty() {
        when(stockService.updateStockData(eq(ticker), any()))
            .thenThrow(new UnknownTickerException(ticker));

        assertThrows(UnknownTickerException.class, () -> portfolioService.addHolding(ticker, 1));

        assertFalse(trackedStockRepository.existsByTicker(ticker));
        new TransactionTemplate(transactionManager).executeWithoutResult(status ->
            assertTrue(portfolioRepository.findByUserId(user.getId()).orElseThrow().getHoldings().isEmpty()));
        verifyNoInteractions(transactionService, journalEntryService);
    }

    @Test
    void failedFetchRollsBackIncrementForAnExistingOwner() {
        portfolioService.addHolding(ticker, 1, 100.0, null);
        authenticate(createUserWithPortfolio());
        when(stockService.updateStockData(eq(ticker), any()))
            .thenThrow(new UnknownTickerException(ticker));

        assertThrows(UnknownTickerException.class, () -> portfolioService.addHolding(ticker, 1));

        assertEquals(1, trackedStockRepository.findByTicker(ticker).orElseThrow().getHolderCount());
    }

    @Test
    void failedSellRecordingRollsBackTrackingRemovalAndHoldingRemoval() {
        portfolioService.addHolding(ticker, 1, 100.0, null);
        when(transactionService.recordSellTransaction(ticker, 1, 100.0, null))
            .thenThrow(new IllegalStateException("Could not record sale"));

        assertThrows(IllegalStateException.class,
            () -> portfolioService.removeHolding(ticker, 100.0, null));

        assertEquals(1, trackedStockRepository.findByTicker(ticker).orElseThrow().getHolderCount());
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            Portfolio portfolio = portfolioRepository.findByUserId(user.getId()).orElseThrow();
            assertEquals(1, portfolio.getHoldings().size());
            assertEquals(ticker, portfolio.getHoldings().get(0).getTicker());
        });
    }

    private User createUserWithPortfolio() {
        return new TransactionTemplate(transactionManager).execute(status -> {
            User saved = userRepository.save(new User("tracking-" + UUID.randomUUID(), "test-password"));
            portfolioRepository.save(new Portfolio(saved, new ArrayList<>()));
            return saved;
        });
    }

    private void authenticate(User owner) {
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken(owner, null));
    }
}
