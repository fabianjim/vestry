package me.vestry.config;

import me.vestry.model.DemoSession;
import me.vestry.service.DemoSessionResolver;
import me.vestry.service.DemoSessionService;
import jakarta.servlet.http.HttpSession;
import jakarta.servlet.http.HttpSessionEvent;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.HashSet;
import java.util.Set;

import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class DemoSessionCleanupListenerTest {

    @Mock
    private DemoSessionService demoSessionService;

    @Mock
    private HttpSessionEvent event;

    @Mock
    private HttpSession session;

    @InjectMocks
    private DemoSessionCleanupListener listener;

    @Test
    void sessionDestroyedCleansUpAllSessionTrackedTickers() {
        DemoSession demoSession = new DemoSession();
        demoSession.setSessionTrackedTickers(new HashSet<>(Set.of("AAPL", "TSLA", "NVDA")));

        when(event.getSession()).thenReturn(session);
        when(session.getAttribute(DemoSessionResolver.DEMO_SESSION_KEY)).thenReturn(demoSession);

        listener.sessionDestroyed(event);

        verify(demoSessionService).stopTrackingStockForSession(demoSession, "AAPL");
        verify(demoSessionService).stopTrackingStockForSession(demoSession, "TSLA");
        verify(demoSessionService).stopTrackingStockForSession(demoSession, "NVDA");
    }

    @Test
    void sessionDestroyedDoesNothingWithoutDemoSession() {
        when(event.getSession()).thenReturn(session);
        when(session.getAttribute(DemoSessionResolver.DEMO_SESSION_KEY)).thenReturn(null);

        listener.sessionDestroyed(event);

        verifyNoInteractions(demoSessionService);
    }
}
