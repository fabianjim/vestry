package com.github.fabianjim.portfoliomonitor.controller;

import com.github.fabianjim.portfoliomonitor.model.DemoSession;
import com.github.fabianjim.portfoliomonitor.model.User;
import com.github.fabianjim.portfoliomonitor.repository.UserRepository;
import com.github.fabianjim.portfoliomonitor.service.DemoSessionService;

import jakarta.servlet.http.HttpSession;

import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/auth")
public class LoginController {

    private static final String DEMO_SESSION_KEY = "DEMO_SESSION";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final DemoSessionService demoSessionService;

    public LoginController(UserRepository userRepository, PasswordEncoder passwordEncoder, DemoSessionService demoSessionService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.demoSessionService = demoSessionService;
    }

    @PostMapping("/register")
    public ResponseEntity<RegisterResponse> register(@RequestBody RegisterRequest request) {
        if (userRepository.existsByUsername(request.username)) {
            return ResponseEntity.badRequest()
                    .body(new RegisterResponse("This user already exists", null));
        }

        String hashedPassword = passwordEncoder.encode(request.password);
        User user = new User(request.username, hashedPassword);
        userRepository.save(user);

        return ResponseEntity.ok(
                new RegisterResponse("User created successfully", user.getUsername())
        );
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@RequestBody LoginRequest request, HttpSession session) {
        Optional<User> foundUser = userRepository.findByUsername(request.username);

        if (foundUser.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(new LoginResponse("Invalid username or password", null, null, false));
        }
        User user = foundUser.get();
        if (!passwordEncoder.matches(request.password, user.getPassword())) {
            return ResponseEntity.badRequest()
                    .body(new LoginResponse("Invalid username or password", null, null, false));
        }

        Authentication auth = new UsernamePasswordAuthenticationToken(
                user, null, List.of()
        );
        SecurityContextHolder.getContext().setAuthentication(auth);

        if (user.isDemo()) {
            DemoSession demoSession = demoSessionService.createSession(user);
            session.setAttribute(DEMO_SESSION_KEY, demoSession);
            session.setMaxInactiveInterval(300);
        }

        System.out.println("User " + user.getUsername() + " " + user.getId() + " logged in successfully.");
        return ResponseEntity.ok(
                new LoginResponse("Login successful", user.getUsername(), user.getId(), user.isDemo())
        );
    }

    @GetMapping("/me")
    public ResponseEntity<LoginResponse> me() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof User user)) {
            return ResponseEntity.status(401).body(new LoginResponse("Not authenticated", null, null, false));
        }
        return ResponseEntity.ok(
                new LoginResponse("Authenticated", user.getUsername(), user.getId(), user.isDemo())
        );
    }

    /*@PostMapping("/logout")
    public ResponseEntity<LoginResponse> logout() {
        SecurityContextHolder.clearContext();
        return ResponseEntity.ok(
                new LoginResponse("Logout successful", null, null)
        );
    }*/


    public static class RegisterRequest {
        public String username;
        public String password;
    }

    public static class LoginRequest {
        public String username;
        public String password;
    } 

    public record LoginResponse(String message, String username, Integer userId, boolean isDemo) {}

    public record RegisterResponse(String message, String username) {}
}
