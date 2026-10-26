package me.vestry.controller;

import lombok.RequiredArgsConstructor;
import me.vestry.api.HindsightClient.ReflectionAid;
import me.vestry.api.HindsightClient.Since;
import me.vestry.service.DemoSessionResolver;
import me.vestry.service.ReflectionAidService;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;

@RestController
@RequestMapping("/api/journal")
@RequiredArgsConstructor
public class ReflectionAidController {
    private final ReflectionAidService aids;
    private final DemoSessionResolver sessions;

    public record Result(ReflectionAid aid, LocalDate generatedOn, int remainingToday, Since since) {}

    // demo visitors get pregenerated aids in a later step; until then the button stays hidden for them
    @GetMapping("/reflect-with-ai/availability")
    public ResponseEntity<Map<String, Boolean>> availability() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(Map.of("available", !sessions.isDemoUser() && aids.available()));
    }

    @PostMapping(value = "/entries/{id}/reflect-with-ai", consumes = "application/json")
    public ResponseEntity<?> reflect(@PathVariable int id) {
        if (sessions.isDemoUser()) return error(HttpStatus.FORBIDDEN, "Reflect with AI isn't available in the demo yet");
        var reflection = aids.reflect(sessions.getCurrentUser(), id);
        var response = reflection.response();
        return switch (response.status()) {
            case READY -> ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new Result(
                    response.result().aid(), response.result().generatedOn(), response.result().remainingToday(), reflection.since()));
            case LIMITED -> error(HttpStatus.TOO_MANY_REQUESTS, "You've used today's AI reflections");
            case NOT_FOUND -> error(HttpStatus.NOT_FOUND, "Journal entry not found");
            case UNAVAILABLE -> error(HttpStatus.SERVICE_UNAVAILABLE, "Couldn't reflect right now");
        };
    }

    private static ResponseEntity<Map<String, String>> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(Map.of("error", message));
    }
}
