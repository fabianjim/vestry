package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.model.DemoSession;
import com.github.fabianjim.portfoliomonitor.model.User;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
public class DemoSessionResolver {

    public static final String DEMO_SESSION_KEY = "DEMO_SESSION";

    public boolean isDemoUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof User user)) {
            return false;
        }
        return user.isDemo();
    }

    public DemoSession resolveSession(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) {
            throw new RuntimeException("Demo session not found");
        }
        DemoSession demoSession = (DemoSession) session.getAttribute(DEMO_SESSION_KEY);
        if (demoSession == null) {
            throw new RuntimeException("Demo session not found");
        }
        return demoSession;
    }

    public User getCurrentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof User user)) {
            throw new RuntimeException("No authenticated user found");
        }
        return user;
    }
}
