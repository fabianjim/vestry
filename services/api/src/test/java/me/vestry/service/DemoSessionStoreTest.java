package me.vestry.service;

import me.vestry.model.DemoSession;
import me.vestry.model.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DemoSessionStoreTest {
    private final DemoSessionService service = mock(DemoSessionService.class);
    private final Clock clock = mock(Clock.class);
    private final Instant start = Instant.parse("2026-09-23T14:50:00Z");
    private final User user = new User("demo", "encoded");
    private DemoSessionStore store;

    @BeforeEach
    void setUp() {
        user.setId(1);
        user.setDemo(true);
        when(clock.instant()).thenReturn(start);
        when(service.createSession(user)).thenAnswer(invocation -> new DemoSession());
        store = new DemoSessionStore(service, clock);
    }

    @Test
    void resumesTheSameDataAndExtendsIdleExpiry() {
        String id = store.resume(null, user);
        DemoSession original = store.findAndTouch(id, user.getId());
        original.setRemainingTrades(2);
        when(clock.instant()).thenReturn(start.plusSeconds(15 * 60));
        assertEquals(id, store.resume(id, user));
        assertSame(original, store.findAndTouch(id, user.getId()));
        assertEquals(2, original.getRemainingTrades());
        when(clock.instant()).thenReturn(start.plusSeconds(40 * 60));
        store.removeExpired();
        assertSame(original, store.findAndTouch(id, user.getId()));
        verify(service, times(1)).createSession(user);
        verify(service, never()).stopTrackingStockForSession(any(), any());
    }

    @Test
    void expiresAtThirtyMinutesWithoutRevivingTheOldDemo() {
        String id = store.resume(null, user);
        DemoSession original = store.findAndTouch(id, user.getId());
        original.setRemainingTrades(0);
        when(clock.instant()).thenReturn(start.plusSeconds(30 * 60));
        assertNull(store.findAndTouch(id, user.getId()));
        String replacement = store.resume(id, user);
        assertNotEquals(id, replacement);
        assertEquals(3, store.findAndTouch(replacement, user.getId()).getRemainingTrades());
    }

    @Test
    void isolatesVisitorsAndDemoAccounts() {
        String first = store.resume(null, user);
        String second = store.resume(null, user);
        assertNotSame(store.findAndTouch(first, 1), store.findAndTouch(second, 1));
        assertNull(store.findAndTouch(first, 2));
        assertNull(store.findAndTouch("unrecognized", 1));
        assertNotEquals("unrecognized", store.resume("unrecognized", user));
    }

    @Test
    void shutdownReleasesUnexpiredDemos() {
        String id = store.resume(null, user);
        DemoSession demo = store.findAndTouch(id, 1);
        demo.getSessionTrackedTickers().add("AAPL");
        store.destroy();
        store.destroy();
        assertNull(store.findAndTouch(id, 1));
        verify(service, times(1)).stopTrackingStockForSession(demo, "AAPL");
    }

    @Test
    void expiryRetriesFailedCleanupWithoutReleasingSuccessfulTickersTwice() {
        String id = store.resume(null, user);
        DemoSession demo = store.findAndTouch(id, 1);
        demo.getSessionTrackedTickers().addAll(java.util.Set.of("AAPL", "MSFT"));
        doAnswer(invocation -> { demo.getSessionTrackedTickers().remove("AAPL"); return null; })
                .when(service).stopTrackingStockForSession(demo, "AAPL");
        doThrow(new IllegalStateException("Database unavailable"))
                .doAnswer(invocation -> { demo.getSessionTrackedTickers().remove("MSFT"); return null; })
                .when(service).stopTrackingStockForSession(demo, "MSFT");
        when(clock.instant()).thenReturn(start.plusSeconds(30 * 60));
        store.removeExpired();
        assertNull(store.findAndTouch(id, 1));
        store.removeExpired();
        store.removeExpired();
        verify(service, times(1)).stopTrackingStockForSession(demo, "AAPL");
        verify(service, times(2)).stopTrackingStockForSession(demo, "MSFT");
    }
}
