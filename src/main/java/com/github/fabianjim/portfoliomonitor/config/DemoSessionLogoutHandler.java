package com.github.fabianjim.portfoliomonitor.config;

import com.github.fabianjim.portfoliomonitor.model.DemoSession;
import com.github.fabianjim.portfoliomonitor.service.DemoSessionResolver;
import com.github.fabianjim.portfoliomonitor.service.DemoSessionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.logout.LogoutHandler;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.Set;

@Component
public class DemoSessionLogoutHandler implements LogoutHandler {

    private static final Logger logger = LoggerFactory.getLogger(DemoSessionLogoutHandler.class);

    private final DemoSessionService demoSessionService;

    public DemoSessionLogoutHandler(DemoSessionService demoSessionService) {
        this.demoSessionService = demoSessionService;
    }

    @Override
    public void logout(HttpServletRequest request, HttpServletResponse response, Authentication authentication) {
        HttpSession session = request.getSession(false);
        if (session == null) {
            return;
        }

        Object demoSessionObj = session.getAttribute(DemoSessionResolver.DEMO_SESSION_KEY);
        if (!(demoSessionObj instanceof DemoSession demoSession)) {
            return;
        }

        Set<String> tickers = new HashSet<>(demoSession.getSessionTrackedTickers());
        logger.info("Demo user logging out; cleaning up {} session-tracked tickers before invalidation", tickers.size());

        for (String ticker : tickers) {
            try {
                demoSessionService.stopTrackingStockForSession(demoSession, ticker);
            } catch (Exception e) {
                logger.error("Failed to clean up demo tracked stock for ticker={} during logout", ticker, e);
            }
        }
    }
}
