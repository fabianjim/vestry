package com.github.fabianjim.portfoliomonitor.config;

import com.github.fabianjim.portfoliomonitor.model.DemoSession;
import com.github.fabianjim.portfoliomonitor.service.DemoSessionResolver;
import com.github.fabianjim.portfoliomonitor.service.DemoSessionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.Authentication;

import java.util.HashSet;
import java.util.Set;

import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class DemoSessionLogoutHandlerTest {

    @Mock
    private DemoSessionService demoSessionService;

    @Mock
    private HttpServletRequest request;

    @Mock
    private HttpServletResponse response;

    @Mock
    private HttpSession session;

    @Mock
    private Authentication authentication;

    @InjectMocks
    private DemoSessionLogoutHandler handler;

    @Test
    void logoutCleansUpAllSessionTrackedTickers() {
        DemoSession demoSession = new DemoSession();
        demoSession.setSessionTrackedTickers(new HashSet<>(Set.of("AAPL", "TSLA", "NVDA")));

        when(request.getSession(false)).thenReturn(session);
        when(session.getAttribute(DemoSessionResolver.DEMO_SESSION_KEY)).thenReturn(demoSession);

        handler.logout(request, response, authentication);

        verify(demoSessionService).stopTrackingStockForSession(demoSession, "AAPL");
        verify(demoSessionService).stopTrackingStockForSession(demoSession, "TSLA");
        verify(demoSessionService).stopTrackingStockForSession(demoSession, "NVDA");
    }

    @Test
    void logoutDoesNothingWhenNoSession() {
        when(request.getSession(false)).thenReturn(null);

        handler.logout(request, response, authentication);

        verifyNoInteractions(demoSessionService);
    }

    @Test
    void logoutDoesNothingForNonDemoSession() {
        when(request.getSession(false)).thenReturn(session);
        when(session.getAttribute(DemoSessionResolver.DEMO_SESSION_KEY)).thenReturn(null);

        handler.logout(request, response, authentication);

        verifyNoInteractions(demoSessionService);
    }
}
