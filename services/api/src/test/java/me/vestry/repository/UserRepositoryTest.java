package me.vestry.repository;

import me.vestry.model.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import jakarta.persistence.EntityManager;

import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
@ActiveProfiles("test")
class UserRepositoryTest {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private EntityManager entityManager;

    @Test
    void testSaveAndFindUser() {
        User user = new User("user", "password");
        
        User savedUser = userRepository.save(user);
        
        assertNotNull(savedUser.getId());
        assertEquals("user", savedUser.getUsername());
        assertEquals("password", savedUser.getPassword());
    }

    @Test
    void testFindByUsername() {
        User user = new User("user111", "password");
        userRepository.save(user);
        
        Optional<User> foundUser = userRepository.findByUsername("user111");
        
        assertTrue(foundUser.isPresent());
        assertEquals("user111", foundUser.get().getUsername());
        assertEquals("password", foundUser.get().getPassword());
    }

    @Test
    void testExistsByUsername() {
        User user = new User("alice", "password123");
        userRepository.save(user);
        
        //existent user
        assertTrue(userRepository.existsByUsername("alice"));

        //non-existent user
        assertFalse(userRepository.existsByUsername("bob"));

        // registration and login compare names ignoring case
        assertFalse(userRepository.existsByUsername("ALICE"));
        assertTrue(userRepository.existsByUsernameIgnoreCase("ALICE"));
        assertEquals(1, userRepository.findAllByUsernameIgnoreCase("Alice").size());
    }

    @Test
    void testUserDeletion() {
        User user = new User("delete_test", "password");
        User savedUser = userRepository.save(user);
        int userId = savedUser.getId();
        assertTrue(userRepository.existsById(userId));
        
        userRepository.delete(savedUser);
        
        assertFalse(userRepository.existsById(userId));
        assertFalse(userRepository.existsByUsername("delete_test"));
    }

    @Test
    void insightInputsChangedAtIsWrittenOnlyByTheMarkUpdate() {
        int id = userRepository.saveAndFlush(new User("gate_user", "password")).getId();
        assertTrue(userRepository.findInsightInputsChangedAt(id).isEmpty());
        entityManager.clear();
        User stale = userRepository.findById(id).orElseThrow();
        entityManager.clear();

        Instant changed = Instant.parse("2026-10-28T15:00:00Z");
        userRepository.markInsightInputsChanged(id, changed);
        assertEquals(Optional.of(changed), userRepository.findInsightInputsChangedAt(id));

        // a User loaded before the mark (like the session's principal) is saved again later
        stale.setUsername("gate_renamed");
        userRepository.saveAndFlush(stale);
        entityManager.clear();

        assertEquals("gate_renamed", userRepository.findById(id).orElseThrow().getUsername());
        assertEquals(Optional.of(changed), userRepository.findInsightInputsChangedAt(id));
    }
}
