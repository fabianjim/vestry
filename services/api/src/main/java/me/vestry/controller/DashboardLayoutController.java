package me.vestry.controller;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import me.vestry.service.DashboardLayoutService;
import me.vestry.service.DemoSessionResolver;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/portfolio/dashboard-layout")
public class DashboardLayoutController {
    private final DashboardLayoutService layouts;
    private final DemoSessionResolver sessions;

    public DashboardLayoutController(DashboardLayoutService layouts, DemoSessionResolver sessions) {
        this.layouts = layouts;
        this.sessions = sessions;
    }

    @GetMapping
    public JsonNode get(HttpServletRequest request) {
        return layouts.get(sessions.getCurrentUser(),
                sessions.isDemoUser() ? sessions.resolveSession(request) : null);
    }

    @PutMapping
    public JsonNode save(@RequestBody JsonNode layout, HttpServletRequest request) {
        return layouts.save(sessions.getCurrentUser(),
                sessions.isDemoUser() ? sessions.resolveSession(request) : null, layout);
    }
}
