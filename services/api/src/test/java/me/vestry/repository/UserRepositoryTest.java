package me.vestry.repository;

import me.vestry.model.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
@ActiveProfiles("test")
class UserRepositoryTest {

    @Autowired
    private UserRepository userRepository;

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
}
