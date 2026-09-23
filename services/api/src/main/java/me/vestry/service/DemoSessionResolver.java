package me.vestry.service;

import me.vestry.model.DemoSession;
import me.vestry.model.User;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.DispatcherType;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.util.WebUtils;

import java.io.IOException;

@Component
public class DemoSessionResolver implements HandlerInterceptor {

    public static final String DEMO_SESSION_KEY = "DEMO_SESSION";
    private static final String COOKIE_NAME = "VESTRY_DEMO";
    private final DemoSessionStore store;
    private final Environment environment;

    public DemoSessionResolver(DemoSessionStore store, Environment environment) {
        this.store = store;
        this.environment = environment;
    }

    public String resume(User user, HttpServletRequest request, HttpServletResponse response) {
        Cookie cookie = WebUtils.getCookie(request, COOKIE_NAME);
        String id = store.resume(cookie == null ? null : cookie.getValue(), user);
        writeCookie(id, request, response);
        return id;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws IOException {
        if (request.getDispatcherType() != DispatcherType.REQUEST || !isDemoUser()) return true;
        HttpSession session = request.getSession(false);
        String id = session == null ? null : (String) session.getAttribute(DEMO_SESSION_KEY);
        DemoSession demo = store.findAndTouch(id, getCurrentUser().getId());
        if (demo == null) {
            if (session != null) session.invalidate();
            SecurityContextHolder.clearContext();
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Demo session expired");
            return false;
        }
        request.setAttribute(DEMO_SESSION_KEY, demo);
        writeCookie(id, request, response);
        return true;
    }

    private void writeCookie(String id, HttpServletRequest request, HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from(COOKIE_NAME, id)
                .httpOnly(true).secure(request.isSecure() || environment.matchesProfiles("prod"))
                .sameSite("Lax").path("/api").maxAge(DemoSessionStore.IDLE_TIMEOUT).build().toString());
    }

    public boolean isDemoUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof User user)) {
            return false;
        }
        return user.isDemo();
    }

    public DemoSession resolveSession(HttpServletRequest request) {
        DemoSession demoSession = (DemoSession) request.getAttribute(DEMO_SESSION_KEY);
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
