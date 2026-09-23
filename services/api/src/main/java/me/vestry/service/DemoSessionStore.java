package me.vestry.service;

import jakarta.annotation.PreDestroy;
import me.vestry.model.DemoSession;
import me.vestry.model.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.UUID;

/** Keeps a visitor's demo alive independently of login/logout on this backend instance. */
@Service
public class DemoSessionStore {
    public static final Duration IDLE_TIMEOUT = Duration.ofMinutes(30);
    private static final Logger logger = LoggerFactory.getLogger(DemoSessionStore.class);
    private final Map<String, Entry> sessions = new HashMap<>();
    private final DemoSessionService service;
    private final Clock clock;

    @Autowired
    public DemoSessionStore(DemoSessionService service) {
        this(service, Clock.systemUTC());
    }

    DemoSessionStore(DemoSessionService service, Clock clock) {
        this.service = service;
        this.clock = clock;
    }

    public synchronized String resume(String id, User user) {
        if (findAndTouch(id, user.getId()) != null) return id;
        String newId = UUID.randomUUID().toString();
        DemoSession demo = service.createSession(user);
        sessions.put(newId, new Entry(user.getId(), demo, clock.instant()));
        return newId;
    }

    public synchronized DemoSession findAndTouch(String id, int userId) {
        Entry entry = sessions.get(id);
        Instant now = clock.instant();
        if (entry == null || entry.userId() != userId || expired(entry, now)) return null;
        sessions.put(id, new Entry(userId, entry.demo(), now));
        return entry.demo();
    }

    // Expired entries remain inaccessible while unsuccessful tracking cleanup is retried.
    @Scheduled(fixedDelay = 60_000)
    public synchronized void removeExpired() {
        Instant now = clock.instant();
        sessions.values().removeIf(entry -> expired(entry, now) && release(entry.demo()));
    }

    @PreDestroy
    public synchronized void destroy() {
        sessions.values().forEach(entry -> release(entry.demo()));
        sessions.clear();
    }

    private boolean release(DemoSession demo) {
        for (String ticker : new HashSet<>(demo.getSessionTrackedTickers())) {
            try {
                service.stopTrackingStockForSession(demo, ticker);
            } catch (RuntimeException e) {
                logger.error("Failed to release retained demo ticker={}", ticker, e);
            }
        }
        return demo.getSessionTrackedTickers().isEmpty();
    }

    private boolean expired(Entry entry, Instant now) {
        return !now.isBefore(entry.lastUsed().plus(IDLE_TIMEOUT));
    }

    private record Entry(int userId, DemoSession demo, Instant lastUsed) {}
}
