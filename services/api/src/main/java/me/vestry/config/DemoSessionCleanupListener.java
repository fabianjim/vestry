package me.vestry.config;

import me.vestry.model.DemoSession;
import me.vestry.service.DemoSessionResolver;
import me.vestry.service.DemoSessionService;
import jakarta.servlet.annotation.WebListener;
import jakarta.servlet.http.HttpSession;
import jakarta.servlet.http.HttpSessionEvent;
import jakarta.servlet.http.HttpSessionListener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.Set;

@Component
@WebListener
public class DemoSessionCleanupListener implements HttpSessionListener {

    private static final Logger logger = LoggerFactory.getLogger(DemoSessionCleanupListener.class);

    private final DemoSessionService demoSessionService;

    public DemoSessionCleanupListener(DemoSessionService demoSessionService) {
        this.demoSessionService = demoSessionService;
    }

    @Override
    public void sessionDestroyed(HttpSessionEvent event) {
        HttpSession session = event.getSession();
        Object demoSessionObj = session.getAttribute(DemoSessionResolver.DEMO_SESSION_KEY);
        if (!(demoSessionObj instanceof DemoSession demoSession)) {
            return;
        }

        Set<String> tickers = new HashSet<>(demoSession.getSessionTrackedTickers());
        logger.info("Demo session destroyed (timeout or external invalidation); cleaning up {} session-tracked tickers", tickers.size());

        for (String ticker : tickers) {
            try {
                demoSessionService.stopTrackingStockForSession(demoSession, ticker);
            } catch (Exception e) {
                logger.error("Failed to clean up demo tracked stock for ticker={} during session destruction", ticker, e);
            }
        }
    }
}
