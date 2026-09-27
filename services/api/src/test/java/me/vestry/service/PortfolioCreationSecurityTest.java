package me.vestry.service;

import me.vestry.model.Holding;
import me.vestry.model.Portfolio;
import me.vestry.model.User;
import me.vestry.repository.PortfolioRepository;
import me.vestry.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
@ActiveProfiles("test")
@Import(PortfolioService.class)
class PortfolioCreationSecurityTest {
    @Autowired private PortfolioService service;
    @Autowired private PortfolioRepository portfolios;
    @Autowired private UserRepository users;
    @Autowired private TestEntityManager entityManager;
    @MockitoBean private StockService stocks;
    @MockitoBean private TrackedStockService tracking;
    @MockitoBean private TransactionService transactions;
    @MockitoBean private JournalEntryService journal;

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void suppliedPortfolioIdCannotReassignOrClearAnotherUsersPortfolio() {
        User owner = users.save(new User("owner", "test-hash"));
        User caller = users.save(new User("caller", "test-hash"));
        Portfolio original = portfolios.saveAndFlush(new Portfolio(owner,
            new ArrayList<>(List.of(new Holding("AAPL", 10)))));
        int originalId = original.getId();
        SecurityContextHolder.setContext(SecurityContextHolder.createEmptyContext());
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken(caller, null, List.of()));

        Portfolio input = new Portfolio(owner, new ArrayList<>());
        input.setId(originalId);
        service.createPortfolio(input);
        entityManager.flush();
        entityManager.clear();

        Portfolio preserved = portfolios.findById(originalId).orElseThrow();
        assertEquals(owner.getId(), preserved.getUser().getId());
        assertEquals(1, preserved.getHoldings().size());
        assertEquals("AAPL", preserved.getHoldings().get(0).getTicker());
        assertEquals(10, preserved.getHoldings().get(0).getShares());
        Portfolio created = portfolios.findByUserId(caller.getId()).orElseThrow();
        assertNotEquals(originalId, created.getId());
        assertTrue(created.getHoldings().isEmpty());
    }
}
