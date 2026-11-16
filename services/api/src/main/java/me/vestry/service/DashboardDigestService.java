package me.vestry.service;

import me.vestry.api.HindsightClient;
import me.vestry.api.HindsightClient.Briefing;
import me.vestry.api.HindsightClient.BriefingAttemptStatus;
import me.vestry.api.HindsightClient.BriefingRequest;
import me.vestry.api.HindsightClient.BriefingStatus;
import me.vestry.dto.DigestContent;
import me.vestry.dto.NewsBriefing;
import me.vestry.model.DemoSession;
import me.vestry.model.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;

/** The dashboard briefing. Hindsight writes and keeps it; vestry supplies the portfolio facts and shows the state. */
@Service
public class DashboardDigestService {
    private static final Logger log = LoggerFactory.getLogger(DashboardDigestService.class);
    private static final ZoneId ZONE = ZoneId.of("America/New_York");

    private final HindsightClient hindsight;
    private final BriefingFactsService facts;
    private final DashboardLayoutService layouts;
    private final DemoSessionResolver users;
    private final Executor executor;
    private final Clock clock;
    /** Instance-local, like the rest of vestry's in-memory state: production is a single instance. */
    private final Set<Integer> inFlight = ConcurrentHashMap.newKeySet();
    /** The day hindsight last refused a user's briefing before the model; shown once, then the user may retry. */
    private final Map<Integer, LocalDate> refused = new ConcurrentHashMap<>();

    public enum Status { DISABLED, HIDDEN, IDLE, GENERATING, READY, FAILED, LIMITED }
    public record Digest(UUID id, Instant capturedAt, Instant generatedAt, DigestContent content) {}
    public record State(Status status, LocalDate day, Digest digest) {}

    public DashboardDigestService(HindsightClient hindsight, BriefingFactsService facts, DashboardLayoutService layouts,
                                  DemoSessionResolver users, @Qualifier("briefingExecutor") Executor executor,
                                  Clock clock) {
        this.hindsight = hindsight;
        this.facts = facts;
        this.layouts = layouts;
        this.users = users;
        this.executor = executor;
        this.clock = clock;
    }

    public boolean available() { return hindsight.isEnabled(); }

    public State get(DemoSession demo) {
        return state(users.getCurrentUser(), demo, today());
    }

    /** Captures the facts here, on the request thread, and posts them in the background. Demo visitors only read. */
    public State generate(DemoSession demo) {
        var user = users.getCurrentUser();
        var day = today();
        var before = state(user, demo, day);
        if (user.isDemo() || before.status() != Status.IDLE) return before;
        int userId = user.getId();
        if (!inFlight.add(userId)) return new State(Status.GENERATING, day, before.digest());
        try {
            var request = facts.capture(user);
            executor.execute(() -> run(userId, day, request));
        } catch (RuntimeException failure) {
            inFlight.remove(userId);
            // the class only: portfolio facts stay out of the logs
            log.warn("Briefing could not be started: {}", failure.getClass().getSimpleName());
            return new State(Status.LIMITED, day, before.digest());
        }
        return new State(Status.GENERATING, day, before.digest());
    }

    /** Scheduler entry point: no principal or visitor layout. Hindsight keeps one attempt a day, so reruns are free. */
    public BriefingStatus generateDemo(User template) {
        return hindsight.createBriefing(template.getId(), facts.captureDemo(template)).status();
    }

    private void run(int userId, LocalDate day, BriefingRequest request) {
        try {
            var status = hindsight.createBriefing(userId, request).status();
            if (status == BriefingStatus.LIMITED || status == BriefingStatus.UNAVAILABLE) refused.put(userId, day);
        } finally {
            inFlight.remove(userId);
        }
    }

    private State state(User user, DemoSession demo, LocalDate day) {
        if (!available()) return new State(Status.DISABLED, day, null);
        if (!layouts.get(user, demo).path("showBriefing").asBoolean()) return new State(Status.HIDDEN, day, null);
        var latest = hindsight.latestBriefing(user.getId()).orElse(null);
        if (latest == null) return new State(Status.DISABLED, day, null);
        var briefing = latest.briefing();
        var digest = briefing == null ? null : digest(briefing, user.isDemo());
        var today = latest.today() != null && day.equals(latest.today().day()) ? latest.today().status() : null;
        if (inFlight.contains(user.getId()) || today == BriefingAttemptStatus.RUNNING) {
            return new State(Status.GENERATING, day, digest);
        }
        if (today == BriefingAttemptStatus.SAVED || (briefing != null && day.equals(briefing.day()))) {
            return new State(Status.READY, day, digest);
        }
        if (today == BriefingAttemptStatus.FAILED) return new State(Status.FAILED, day, digest);
        if (refused.remove(user.getId(), day)) return new State(Status.LIMITED, day, digest);
        return new State(Status.IDLE, day, digest);
    }

    private static Digest digest(Briefing briefing, boolean demoTemplate) {
        var content = briefing.content();
        var questions = orEmpty(content.questions()).stream()
                .map(q -> new DigestContent.Question(q.text(),
                        parse(DigestContent.Destination.class, q.destination(), DigestContent.Destination.JOURNAL)))
                .toList();
        var sources = orEmpty(content.sources()).stream()
                .map(s -> new NewsBriefing.Item(s.headline(), s.summary(), s.publishedOn(), s.url()))
                .toList();
        var newsStatus = parse(NewsBriefing.Status.class, content.newsStatus(), NewsBriefing.Status.UNAVAILABLE);
        return new Digest(briefing.id(), briefing.capturedAt(), briefing.generatedAt(),
                new DigestContent(content.news(), content.reflection(), questions, sources, newsStatus, demoTemplate));
    }

    /** Hindsight's vocabularies are open, so a value vestry doesn't know falls back. */
    private static <E extends Enum<E>> E parse(Class<E> type, String value, E fallback) {
        if (value == null) return fallback;
        try {
            return Enum.valueOf(type, value);
        } catch (IllegalArgumentException unknown) {
            return fallback;
        }
    }

    private static <T> List<T> orEmpty(List<T> list) {
        return list == null ? List.of() : list;
    }

    private LocalDate today() { return clock.instant().atZone(ZONE).toLocalDate(); }
}
