package me.vestry.controller;

import me.vestry.model.User;
import me.vestry.repository.UserRepository;
import me.vestry.service.DemoSessionResolver;
import me.vestry.service.DemoSessionStore;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import org.springframework.boot.autoconfigure.web.ServerProperties;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/auth")
public class LoginController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final DemoSessionResolver demoSessionResolver;
    private final ServerProperties serverProperties;

    public LoginController(UserRepository userRepository, PasswordEncoder passwordEncoder,
                           DemoSessionResolver demoSessionResolver, ServerProperties serverProperties) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.demoSessionResolver = demoSessionResolver;
        this.serverProperties = serverProperties;
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
    public ResponseEntity<LoginResponse> login(@RequestBody LoginRequest request,
                                              HttpServletRequest httpRequest, HttpServletResponse response) {
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

        String demoId = user.isDemo() ? demoSessionResolver.resume(user, httpRequest, response) : null;
        HttpSession previous = httpRequest.getSession(false);
        if (previous != null) previous.invalidate();
        HttpSession session = httpRequest.getSession(true);
        session.setMaxInactiveInterval((int) (user.isDemo() ? DemoSessionStore.IDLE_TIMEOUT
                : serverProperties.getServlet().getSession().getTimeout()).getSeconds());
        if (user.isDemo()) {
            session.setAttribute(DemoSessionResolver.DEMO_SESSION_KEY, demoId);
        }
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new UsernamePasswordAuthenticationToken(user, null, List.of()));
        SecurityContextHolder.setContext(context);
        new HttpSessionSecurityContextRepository().saveContext(context, httpRequest, response);

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
