package me.vestry.controller;

import me.vestry.model.User;
import me.vestry.security.GoogleSignInVerifier;
import me.vestry.security.GoogleSignInVerifier.GoogleIdentity;
import me.vestry.service.DemoSessionResolver;
import me.vestry.service.DemoSessionStore;
import me.vestry.service.UserService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import org.springframework.boot.autoconfigure.web.ServerProperties;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/auth")
public class LoginController {

    private final UserService userService;
    private final DemoSessionResolver demoSessionResolver;
    private final ServerProperties serverProperties;
    private final GoogleSignInVerifier googleVerifier;

    public LoginController(UserService userService, DemoSessionResolver demoSessionResolver,
                           ServerProperties serverProperties, GoogleSignInVerifier googleVerifier) {
        this.userService = userService;
        this.demoSessionResolver = demoSessionResolver;
        this.googleVerifier = googleVerifier;
        this.serverProperties = serverProperties;
    }

    @PostMapping("/register")
    public ResponseEntity<RegisterResponse> register(@RequestBody RegisterRequest request) {
        // People never see the honeypot field; scripts that fill every input do.
        if (request.website != null && !request.website.isBlank()) {
            return ResponseEntity.badRequest().body(new RegisterResponse("Registration failed.", null));
        }
        try {
            User user = userService.registerUser(request.username, request.password);
            return ResponseEntity.ok(new RegisterResponse("User created successfully", user.getUsername()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(new RegisterResponse(e.getMessage(), null));
        }
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@RequestBody LoginRequest request,
                                              HttpServletRequest httpRequest, HttpServletResponse response) {
        Optional<User> authenticated = userService.authenticate(request.username, request.password);
        if (authenticated.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(new LoginResponse("Invalid username or password", null, null, false));
        }
        return startSession(authenticated.get(), httpRequest, response);
    }

    @GetMapping("/google/client-id")
    public GoogleConfigResponse googleConfig() {
        return new GoogleConfigResponse(googleVerifier.clientId());
    }

    @PostMapping("/google")
    public ResponseEntity<LoginResponse> google(@RequestBody GoogleLoginRequest request,
                                               HttpServletRequest httpRequest, HttpServletResponse response) {
        if (!googleVerifier.enabled()) return ResponseEntity.notFound().build();
        Optional<GoogleIdentity> identity = googleVerifier.verify(request.accessToken);
        if (identity.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(new LoginResponse("Google sign-in failed. Try again.", null, null, false));
        }
        try {
            User user = userService.signInWithGoogle(identity.get().subject(), identity.get().email());
            return startSession(user, httpRequest, response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(new LoginResponse(e.getMessage(), null, null, false));
        }
    }

    private ResponseEntity<LoginResponse> startSession(User user, HttpServletRequest httpRequest,
                                                       HttpServletResponse response) {
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

        return ResponseEntity.ok(
                new LoginResponse("Login successful", user.getUsername(), user.getId(), user.isDemo())
        );
    }

    @GetMapping("/session-status")
    public ResponseEntity<SessionStatusResponse> sessionStatus() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return ResponseEntity.ok(new SessionStatusResponse(auth != null && auth.getPrincipal() instanceof User));
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

    public static class RegisterRequest {
        public String username;
        public String password;
        public String website;
    }

    public static class LoginRequest {
        public String username;
        public String password;
    }

    public static class GoogleLoginRequest {
        public String accessToken;
    }

    public record GoogleConfigResponse(String clientId) {}

    public record LoginResponse(String message, String username, Integer userId, boolean isDemo) {}

    public record SessionStatusResponse(boolean authenticated) {}

    public record RegisterResponse(String message, String username) {}
}
