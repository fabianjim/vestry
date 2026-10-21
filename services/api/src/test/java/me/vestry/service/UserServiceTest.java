package me.vestry.service;

import me.vestry.model.User;
import me.vestry.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @InjectMocks
    private UserService userService;

    private User testUser;

    @BeforeEach
    void setUp() {
        testUser = new User("testuser", "password");
        testUser.setId(1);
    }

    @Test
    void testRegisterUserSuccess() {
        // Arrange
        String rawPassword = "plainpassword";
        String hashedPassword = "hashedpassword123";
        
        when(userRepository.existsByUsernameIgnoreCase("newuser")).thenReturn(false);
        when(passwordEncoder.encode(rawPassword)).thenReturn(hashedPassword);
        when(userRepository.saveAndFlush(any(User.class))).thenReturn(testUser);

        // Act
        User result = userService.registerUser("newuser", rawPassword);

        // Assert
        assertNotNull(result);
        assertEquals("testuser", result.getUsername());
        verify(userRepository).existsByUsernameIgnoreCase("newuser");
        verify(passwordEncoder).encode(rawPassword);
        verify(userRepository).saveAndFlush(any(User.class));
    }

    @Test
    void testFindByUsernameFound() {
        when(userRepository.findByUsername("testuser")).thenReturn(Optional.of(testUser));

        Optional<User> result = userService.findByUsername("testuser");

        assertTrue(result.isPresent());
        assertEquals("testuser", result.get().getUsername());
        verify(userRepository).findByUsername("testuser");
    }

    @Test
    void testFindByUsernameNotFound() {
        when(userRepository.findByUsername("nonexistent")).thenReturn(Optional.empty());

        Optional<User> result = userService.findByUsername("nonexistent");

        assertFalse(result.isPresent());
        verify(userRepository).findByUsername("nonexistent");
    }

    @Test
    void testExistsByUsername() {
        when(userRepository.existsByUsername("testuser")).thenReturn(true);
        when(userRepository.existsByUsername("nonexistent")).thenReturn(false);

        assertTrue(userService.existsByUsername("testuser"));
        assertFalse(userService.existsByUsername("nonexistent"));
        
        verify(userRepository).existsByUsername("testuser");
        verify(userRepository).existsByUsername("nonexistent");
    }

    @Test
    void testUpdateUser() {
        when(userRepository.save(testUser)).thenReturn(testUser);

        User result = userService.updateUser(testUser);

        assertNotNull(result);
        assertEquals(testUser.getUsername(), result.getUsername());
        verify(userRepository).save(testUser);
    }

    @Test
    void registrationRejectsInvalidCredentialsAndTakenNamesWithoutSaving() {
        assertRegistrationRejected("ab", "longenough", "Usernames need 3–30 characters");
        assertRegistrationRejected("has space", "longenough", "Usernames need 3–30 characters");
        assertRegistrationRejected("x".repeat(31), "longenough", "Usernames need 3–30 characters");
        assertRegistrationRejected(null, "longenough", "Usernames need 3–30 characters");
        assertRegistrationRejected("casey", "short", "at least 8 characters");
        assertRegistrationRejected("casey", "é".repeat(37), "too long");

        when(userRepository.existsByUsernameIgnoreCase("Casey")).thenReturn(true);
        assertRegistrationRejected(" Casey ", "longenough", "That username is taken.");
        verify(userRepository, never()).saveAndFlush(any());
    }

    @Test
    void registrationTrimsTheNameAndReportsAConcurrentClaimAsTaken() {
        when(userRepository.saveAndFlush(any(User.class)))
                .thenAnswer(invocation -> invocation.getArgument(0))
                .thenThrow(new DataIntegrityViolationException("duplicate key"));

        assertEquals("Casey", userService.registerUser("  Casey ", "longenough").getUsername());
        assertRegistrationRejected("Casey", "longenough", "That username is taken.");
    }

    @Test
    void loginPrefersTheExactNameAndFallsBackToCaseOnlyWhenUnambiguous() {
        User casey = new User("Casey", "hash");
        when(passwordEncoder.matches("secret", "hash")).thenReturn(true);
        when(userRepository.findByUsername("casey")).thenReturn(Optional.empty());
        when(userRepository.findAllByUsernameIgnoreCase("casey")).thenReturn(List.of(casey));
        assertEquals(Optional.of(casey), userService.authenticate(" casey ", "secret"));

        when(userRepository.findAllByUsernameIgnoreCase("casey")).thenReturn(List.of(casey, new User("CASEY", "hash")));
        assertTrue(userService.authenticate("casey", "secret").isEmpty());

        when(userRepository.findByUsername("Casey")).thenReturn(Optional.of(casey));
        assertTrue(userService.authenticate("Casey", "wrong").isEmpty());
        assertTrue(userService.authenticate(null, "secret").isEmpty());
    }

    @Test
    void unknownUsernamesStillCheckAPasswordHash() {
        when(userRepository.findByUsername("ghost")).thenReturn(Optional.empty());
        when(userRepository.findAllByUsernameIgnoreCase("ghost")).thenReturn(List.of());

        assertTrue(userService.authenticate("ghost", "secret").isEmpty());
        verify(passwordEncoder).matches(eq("secret"), any());
    }

    private void assertRegistrationRejected(String username, String password, String message) {
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> userService.registerUser(username, password));
        assertTrue(error.getMessage().contains(message), error.getMessage());
    }

    @Test
    void googleSignInReturnsTheLinkedAccountOrCreatesOneFromTheEmail() {
        User linked = new User("casey", "hash");
        when(userRepository.findByGoogleSubject("g-1")).thenReturn(Optional.of(linked));
        assertSame(linked, userService.signInWithGoogle("g-1", "someone@gmail.com"));
        verify(userRepository, never()).saveAndFlush(any());

        when(userRepository.findByGoogleSubject("g-2")).thenReturn(Optional.empty());
        when(passwordEncoder.encode(anyString())).thenReturn("random-hash");
        when(userRepository.saveAndFlush(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
        User created = userService.signInWithGoogle("g-2", "casey.lee+vestry@gmail.com");
        assertEquals("casey.leevestry", created.getUsername());
        assertEquals("g-2", created.getGoogleSubject());
        assertEquals("random-hash", created.getPassword());
    }

    @Test
    void googleUsernamesGetDigitsWhenTakenOrTooShort() {
        when(userRepository.findByGoogleSubject(anyString())).thenReturn(Optional.empty());
        when(userRepository.saveAndFlush(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(userRepository.existsByUsernameIgnoreCase("casey")).thenReturn(true);

        assertTrue(userService.signInWithGoogle("g-3", "casey@gmail.com").getUsername().matches("casey\\d{4}"));
        assertTrue(userService.signInWithGoogle("g-4", "jo@gmail.com").getUsername().matches("jo\\d{4}"));
        assertTrue(userService.signInWithGoogle("g-5", null).getUsername().matches("user\\d{4}"));
        assertEquals(24, UserService.googleUsernameBase("a".repeat(40) + "@gmail.com").length());
    }
}
