package me.vestry.controller;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import me.vestry.service.DemoSessionResolver;
import me.vestry.service.InsightsService;
import me.vestry.service.InsightsService.Insights;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/insights")
@RequiredArgsConstructor
public class InsightsController {
    private final InsightsService insights;
    private final DemoSessionResolver sessions;

    @GetMapping("/availability")
    public ResponseEntity<Map<String, Boolean>> availability() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("available", insights.available()));
    }

    /** Always 200, so the page can render its unavailable state. */
    @GetMapping
    public ResponseEntity<Insights> report(HttpServletRequest request) {
        var user = sessions.getCurrentUser();
        var result = sessions.isDemoUser()
                ? insights.reportDemo(sessions.resolveSession(request), user)
                : insights.report(user);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result);
    }

    @PostMapping(value = "/refresh", consumes = "application/json")
    public ResponseEntity<?> refresh() {
        // the demo account's report is refreshed nightly; visitors never cause a model call
        if (sessions.isDemoUser()) return error(HttpStatus.FORBIDDEN, "In the demo, Insights are prepared for you");
        var result = insights.refresh(sessions.getCurrentUser());
        if (result == null) return error(HttpStatus.SERVICE_UNAVAILABLE, "Couldn't refresh Insights right now");
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result);
    }

    private static ResponseEntity<Map<String, String>> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(Map.of("error", message));
    }
}
