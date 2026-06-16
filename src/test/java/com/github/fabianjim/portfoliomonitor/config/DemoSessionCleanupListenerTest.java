package com.github.fabianjim.portfoliomonitor.config;

import com.github.fabianjim.portfoliomonitor.model.DemoSession;
import com.github.fabianjim.portfoliomonitor.model.Holding;
import com.github.fabianjim.portfoliomonitor.model.Portfolio;
import com.github.fabianjim.portfoliomonitor.model.TrackedStock;
import com.github.fabianjim.portfoliomonitor.repository.TrackedStockRepository;
import com.github.fabianjim.portfoliomonitor.service.DemoSessionResolver;
import jakarta.servlet.http.HttpSession;
import jakarta.servlet.http.HttpSessionEvent;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class DemoSessionCleanupListenerTest {

    @Mock
    private TrackedStockRepository trackedStockRepository;

    @Mock
    private HttpSessionEvent event;

    @Mock
    private HttpSession session;

    @InjectMocks
    private DemoSessionCleanupListener listener;

    @Test
    void sessionDestroyedCleansUpDemoTrackedStocks() {
        DemoSession demoSession = new DemoSession();
        Portfolio portfolio = new Portfolio();
        portfolio.setHoldings(new ArrayList<>(List.of(
            new Holding("AAPL", 10),
            new Holding("TSLA", 5)
        )));
        demoSession.setPortfolio(portfolio);

        when(event.getSession()).thenReturn(session);
        when(session.getAttribute(DemoSessionResolver.DEMO_SESSION_KEY)).thenReturn(demoSession);

        TrackedStock aaplTracked = new TrackedStock("AAPL");
        aaplTracked.setHolderCount(1);
        TrackedStock tslaTracked = new TrackedStock("TSLA");
        tslaTracked.setHolderCount(2);

        when(trackedStockRepository.findByTicker("AAPL")).thenReturn(Optional.of(aaplTracked));
        when(trackedStockRepository.findByTicker("TSLA")).thenReturn(Optional.of(tslaTracked));

        listener.sessionDestroyed(event);

        verify(trackedStockRepository).delete(aaplTracked);
        verify(trackedStockRepository).save(tslaTracked);
        assert tslaTracked.getHolderCount() == 1;
    }

    @Test
    void sessionDestroyedDoesNothingWithoutDemoSession() {
        when(event.getSession()).thenReturn(session);
        when(session.getAttribute(DemoSessionResolver.DEMO_SESSION_KEY)).thenReturn(null);

        listener.sessionDestroyed(event);

        verifyNoInteractions(trackedStockRepository);
    }
}
