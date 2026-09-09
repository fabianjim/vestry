package me.vestry.service;

import me.vestry.model.Holding;
import me.vestry.model.Portfolio;
import me.vestry.model.User;
import me.vestry.repository.PortfolioRepository;
import me.vestry.repository.UserRepository;
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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@DataJpaTest
@ActiveProfiles("test")
@Import(PortfolioService.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class PortfolioHoldingLimitConcurrencyTest {
    @Autowired private PortfolioService portfolioService;
    @Autowired private PortfolioRepository portfolioRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private PlatformTransactionManager transactionManager;
    @MockitoBean private StockService stockService;
    @MockitoBean private TransactionService transactionService;
    @MockitoBean private JournalEntryService journalEntryService;

    @Test
    void concurrentBuysCannotBothTakeLastSlot() throws Exception {
        TransactionTemplate transactions = new TransactionTemplate(transactionManager);
        User user = transactions.execute(status -> {
            User saved = userRepository.save(new User("holding-limit-concurrency", "test-password"));
            Portfolio portfolio = new Portfolio(saved, new ArrayList<>());
            for (int i = 0; i < 7; i++) portfolio.getHoldings().add(new Holding("T" + i, 1));
            portfolioRepository.save(portfolio);
            return saved;
        });
        assertNotNull(user);

        CountDownLatch firstBuyRecorded = new CountDownLatch(1);
        CountDownLatch releaseFirstBuy = new CountDownLatch(1);
        CountDownLatch secondBuyStarted = new CountDownLatch(1);
        doAnswer(invocation -> {
            firstBuyRecorded.countDown();
            assertTrue(releaseFirstBuy.await(5, TimeUnit.SECONDS));
            return null;
        }).when(transactionService).recordBuyTransaction("FIRST", 1, 100.0, null);

        var executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> buy(user, "FIRST"));
            assertTrue(firstBuyRecorded.await(5, TimeUnit.SECONDS));
            var second = executor.submit(() -> {
                secondBuyStarted.countDown();
                buy(user, "SECOND");
            });
            assertTrue(secondBuyStarted.await(5, TimeUnit.SECONDS));
            // The competing transaction must wait while the first owns the portfolio lock.
            assertThrows(TimeoutException.class, () -> second.get(200, TimeUnit.MILLISECONDS));
            releaseFirstBuy.countDown();
            first.get(5, TimeUnit.SECONDS);
            ExecutionException failure = assertThrows(ExecutionException.class,
                () -> second.get(5, TimeUnit.SECONDS));
            assertInstanceOf(IllegalArgumentException.class, failure.getCause());

            transactions.executeWithoutResult(status -> {
                Portfolio portfolio = portfolioRepository.findByUserId(user.getId()).orElseThrow();
                assertEquals(8, portfolio.getHoldings().size());
                assertTrue(portfolio.getHoldings().stream().anyMatch(h -> h.getTicker().equals("FIRST")));
                assertFalse(portfolio.getHoldings().stream().anyMatch(h -> h.getTicker().equals("SECOND")));
            });
            verify(transactionService, never()).recordBuyTransaction("SECOND", 1, 100.0, null);
        } finally {
            releaseFirstBuy.countDown();
            executor.shutdownNow();
            assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS));
        }
    }

    private void buy(User user, String ticker) {
        try {
            SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(user, null));
            portfolioService.addHolding(ticker, 1, 100.0, null);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }
}
