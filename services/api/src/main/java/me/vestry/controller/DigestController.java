package me.vestry.controller;

import lombok.RequiredArgsConstructor;
import jakarta.servlet.http.HttpServletRequest;
import me.vestry.model.DemoSession;
import me.vestry.service.DashboardDigestService;
import me.vestry.service.DemoSessionResolver;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/portfolio/digest")
@RequiredArgsConstructor
public class DigestController {
    private final DashboardDigestService digests;
    private final DemoSessionResolver sessions;

    @GetMapping("/availability")
    public ResponseEntity<Map<String, Boolean>> availability() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("available", digests.available()));
    }

    @GetMapping
    public ResponseEntity<DashboardDigestService.State> get(HttpServletRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(digests.get(demo(request)));
    }

    @PostMapping(consumes = "application/json")
    public ResponseEntity<DashboardDigestService.State> generate(HttpServletRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(digests.generate(demo(request)));
    }

    private DemoSession demo(HttpServletRequest request) {
        return sessions.isDemoUser() ? sessions.resolveSession(request) : null;
    }
}
