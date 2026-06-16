package com.github.fabianjim.portfoliomonitor.config;

import com.github.fabianjim.portfoliomonitor.model.DemoSession;
import com.github.fabianjim.portfoliomonitor.model.Holding;
import com.github.fabianjim.portfoliomonitor.model.TrackedStock;
import com.github.fabianjim.portfoliomonitor.repository.TrackedStockRepository;
import com.github.fabianjim.portfoliomonitor.service.DemoSessionResolver;
import jakarta.servlet.annotation.WebListener;
import jakarta.servlet.http.HttpSessionEvent;
import jakarta.servlet.http.HttpSessionListener;
import org.springframework.stereotype.Component;

@Component
@WebListener
public class DemoSessionCleanupListener implements HttpSessionListener {

    private final TrackedStockRepository trackedStockRepository;

    public DemoSessionCleanupListener(TrackedStockRepository trackedStockRepository) {
        this.trackedStockRepository = trackedStockRepository;
    }

    @Override
    public void sessionDestroyed(HttpSessionEvent event) {
        Object demoSessionObj = event.getSession().getAttribute(DemoSessionResolver.DEMO_SESSION_KEY);
        if (!(demoSessionObj instanceof DemoSession demoSession)) {
            return;
        }

        if (demoSession.getPortfolio() == null || demoSession.getPortfolio().getHoldings() == null) {
            return;
        }

        for (Holding holding : demoSession.getPortfolio().getHoldings()) {
            stopTrackingStock(holding.getTicker());
        }
    }

    private void stopTrackingStock(String ticker) {
        TrackedStock trackedStock = trackedStockRepository.findByTicker(ticker).orElse(null);
        if (trackedStock == null) {
            return;
        }
        trackedStock.decrementHolderCount();
        if (trackedStock.getHolderCount() <= 0) {
            trackedStockRepository.delete(trackedStock);
        } else {
            trackedStockRepository.save(trackedStock);
        }
    }
}
