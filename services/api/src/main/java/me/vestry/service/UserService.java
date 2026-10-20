package me.vestry.service;

import me.vestry.model.User;
import me.vestry.repository.UserRepository;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Pattern;

@Service
@Transactional
public class UserService {

    private static final Pattern USERNAME = Pattern.compile("[A-Za-z0-9._-]{3,30}");
    private static final int MIN_PASSWORD_LENGTH = 8;
    // BCrypt ignores everything past 72 bytes.
    private static final int MAX_PASSWORD_BYTES = 72;
    private static final String USERNAME_TAKEN = "That username is taken.";
    private static final int GOOGLE_USERNAME_BASE_LENGTH = 24;
    private static final SecureRandom SECRETS = new SecureRandom();

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    // Unknown usernames are checked against this so they take as long as wrong passwords.
    private final String unknownUserHash;

    public UserService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.unknownUserHash = passwordEncoder.encode("unknown-user");
    }

    /** Usernames keep their casing but must be unique ignoring case. */
    public User registerUser(String username, String password) {
        String name = username == null ? "" : username.trim();
        if (!USERNAME.matcher(name).matches()) {
            throw new IllegalArgumentException(
                    "Usernames need 3–30 characters: letters, numbers, periods, underscores or hyphens.");
        }
        if (password == null || password.length() < MIN_PASSWORD_LENGTH) {
            throw new IllegalArgumentException("Passwords need at least " + MIN_PASSWORD_LENGTH + " characters.");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
            throw new IllegalArgumentException("That password is too long.");
        }
        if (userRepository.existsByUsernameIgnoreCase(name)) {
            throw new IllegalArgumentException(USERNAME_TAKEN);
        }
        try {
            return userRepository.saveAndFlush(new User(name, passwordEncoder.encode(password)));
        } catch (DataIntegrityViolationException e) {
            // A concurrent registration claimed the name after the check above.
            throw new IllegalArgumentException(USERNAME_TAKEN);
        }
    }

    /**
     * Matches the exact username first. Older accounts may differ only by case, so the
     * case-insensitive fallback applies only when it identifies a single account.
     */
    public Optional<User> authenticate(String username, String password) {
        if (username == null || password == null) return Optional.empty();
        String name = username.trim();
        Optional<User> user = userRepository.findByUsername(name).or(() -> {
            List<User> matches = userRepository.findAllByUsernameIgnoreCase(name);
            return matches.size() == 1 ? Optional.of(matches.get(0)) : Optional.empty();
        });
        boolean matches = passwordEncoder.matches(password, user.map(User::getPassword).orElse(unknownUserHash));
        return user.isPresent() && matches ? user : Optional.empty();
    }

    /**
     * Returns the account for this Google identity, creating it on first sign-in with a
     * username taken from the email and a random password, so only Google can sign it in.
     */
    public User signInWithGoogle(String subject, String email) {
        Optional<User> existing = userRepository.findByGoogleSubject(subject);
        if (existing.isPresent()) return existing.get();

        byte[] secret = new byte[32];
        SECRETS.nextBytes(secret);
        User user = new User(availableGoogleUsername(email),
                passwordEncoder.encode(Base64.getEncoder().encodeToString(secret)));
        user.setGoogleSubject(subject);
        try {
            return userRepository.saveAndFlush(user);
        } catch (DataIntegrityViolationException e) {
            // A concurrent first sign-in claimed the account or username; retrying finds or renames it.
            throw new IllegalArgumentException("Google sign-in failed. Try again.");
        }
    }

    static String googleUsernameBase(String email) {
        String local = email == null ? "" : email.split("@", 2)[0];
        String cleaned = local.replaceAll("[^A-Za-z0-9._-]", "");
        return cleaned.length() > GOOGLE_USERNAME_BASE_LENGTH ? cleaned.substring(0, GOOGLE_USERNAME_BASE_LENGTH) : cleaned;
    }

    private String availableGoogleUsername(String email) {
        String base = googleUsernameBase(email);
        if (base.length() >= 3 && !userRepository.existsByUsernameIgnoreCase(base)) return base;
        String prefix = base.isEmpty() ? "user" : base;
        for (int attempt = 0; attempt < 20; attempt++) {
            String candidate = prefix + ThreadLocalRandom.current().nextInt(1000, 10000);
            if (!userRepository.existsByUsernameIgnoreCase(candidate)) return candidate;
        }
        throw new IllegalArgumentException("Google sign-in failed. Try again.");
    }

    public Optional<User> findByUsername(String username) {
        return userRepository.findByUsername(username);
    }

    public boolean existsByUsername(String username) {
        return userRepository.existsByUsername(username);
    }

    public User updateUser(User user) {
        return userRepository.save(user);
    }
}
