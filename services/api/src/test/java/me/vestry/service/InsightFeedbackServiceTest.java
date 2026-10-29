package me.vestry.service;

import me.vestry.model.BehaviorFeedback;
import me.vestry.model.BehaviorFeedback.Reaction;
import me.vestry.model.BehaviorKey;
import me.vestry.model.DemoSession;
import me.vestry.model.User;
import me.vestry.repository.InsightFeedbackRepository;
import me.vestry.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

@DataJpaTest
@ActiveProfiles("test")
class InsightFeedbackServiceTest {
    private static final BehaviorKey FOMO = BehaviorKey.parse("fomo");
    private static final BehaviorKey ANXIOUS = BehaviorKey.parse("emotional:anxious");
    private static final LocalDate DAY = LocalDate.parse("2026-10-27");

    @Autowired
    private InsightFeedbackRepository repository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private jakarta.persistence.EntityManager entityManager;

    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-28T14:00:00Z"));
    private InsightFeedbackService service;
    private User user;

    @BeforeEach
    void setUp() {
        service = new InsightFeedbackService(repository, clock);
        user = savedUser("feedbackuser");
    }

    @Test
    void secondSaveForSameBehaviorReplacesTheRow() {
        service.save(user, ANXIOUS, DAY, Reaction.FITS, "first");
        clock.advance(Duration.ofHours(1));
        service.save(user, ANXIOUS, DAY.plusDays(1), Reaction.DOESNT_FIT, "second");
        entityManager.flush();
        entityManager.clear();

        assertEquals(1, repository.count());
        BehaviorFeedback stored = service.list(user).get(0);
        assertEquals(ANXIOUS, stored.behavior());
        assertEquals(Reaction.DOESNT_FIT, stored.reaction());
        assertEquals("second", stored.note());
        assertEquals(DAY.plusDays(1), stored.reportDay());
        assertEquals(Instant.parse("2026-10-28T15:00:00Z"), stored.updatedAt());
    }

    @Test
    void behaviorsWithAndWithoutSubjectAreSeparateRows() {
        service.save(user, FOMO, DAY, Reaction.KNEW, null);
        service.save(user, ANXIOUS, DAY, Reaction.FITS, null);
        entityManager.flush();
        entityManager.clear();

        assertEquals(2, repository.count());
        BehaviorFeedback fomo = service.list(user).stream()
                .filter(feedback -> feedback.behavior().kind().equals("fomo")).findFirst().orElseThrow();
        assertNull(fomo.behavior().subject());
        assertEquals(FOMO, fomo.behavior());
    }

    @Test
    void listIsNewestFirstAndOnlyTheUsersOwn() {
        User other = savedUser("otherfeedbackuser");
        service.save(user, FOMO, DAY, Reaction.FITS, null);
        clock.advance(Duration.ofMinutes(5));
        service.save(other, FOMO, DAY, Reaction.KNEW, null);
        clock.advance(Duration.ofMinutes(5));
        service.save(user, ANXIOUS, DAY, Reaction.DOESNT_FIT, null);
        entityManager.flush();
        entityManager.clear();

        assertEquals(List.of(ANXIOUS, FOMO), service.list(user).stream().map(BehaviorFeedback::behavior).toList());
        assertEquals(List.of(Reaction.KNEW), service.list(other).stream().map(BehaviorFeedback::reaction).toList());
    }

    @Test
    void noteIsStrippedBlankBecomesNullAndLengthIsCapped() {
        assertEquals("calm", service.save(user, FOMO, DAY, Reaction.FITS, "  calm \n").note());
        assertNull(service.save(user, FOMO, DAY, Reaction.FITS, "   ").note());
        assertNull(service.save(user, FOMO, DAY, Reaction.FITS, null).note());
        String max = "x".repeat(1000);
        assertEquals(max, service.save(user, FOMO, DAY, Reaction.FITS, " " + max + " ").note());
        assertThrows(IllegalArgumentException.class,
                () -> service.save(user, FOMO, DAY, Reaction.FITS, "x".repeat(1001)));
    }

    @Test
    void behaviorReportDayAndReactionAreRequired() {
        assertThrows(IllegalArgumentException.class, () -> service.save(user, null, DAY, Reaction.FITS, null));
        assertThrows(IllegalArgumentException.class, () -> service.save(user, FOMO, null, Reaction.FITS, null));
        assertThrows(IllegalArgumentException.class, () -> service.save(user, FOMO, DAY, null, null));
        assertEquals(0, repository.count());
    }

    @Test
    void demoFeedbackStaysInTheSession() {
        InsightFeedbackRepository mockRepository = mock(InsightFeedbackRepository.class);
        InsightFeedbackService demoService = new InsightFeedbackService(mockRepository, clock);
        DemoSession session = new DemoSession();

        demoService.saveDemo(session, FOMO, DAY, Reaction.FITS, "first");
        clock.advance(Duration.ofMinutes(1));
        demoService.saveDemo(session, ANXIOUS, DAY, Reaction.KNEW, null);
        clock.advance(Duration.ofMinutes(1));
        demoService.saveDemo(session, FOMO, DAY, Reaction.DOESNT_FIT, "second");

        assertEquals(2, session.getInsightFeedback().size());
        assertEquals("second", session.getInsightFeedback().get(FOMO).note());
        assertEquals(List.of(FOMO, ANXIOUS), demoService.listDemo(session).stream().map(BehaviorFeedback::behavior).toList());
        verifyNoInteractions(mockRepository);
    }

    private User savedUser(String username) {
        User saved = new User();
        saved.setUsername(username);
        saved.setPassword("password");
        return userRepository.save(saved);
    }

    private static final class MutableClock extends Clock {
        private Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
