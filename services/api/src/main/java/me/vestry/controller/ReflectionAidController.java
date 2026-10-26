package me.vestry.controller;

import jakarta.servlet.http.HttpServletRequest;
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

    /** remainingToday is null for demo visitors, who never spend. */
    public record Result(ReflectionAid aid, LocalDate generatedOn, Integer remainingToday, Since since) {}

    @GetMapping("/reflect-with-ai/availability")
    public ResponseEntity<Map<String, Boolean>> availability() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("available", aids.available()));
    }

    @PostMapping(value = "/entries/{id}/reflect-with-ai", consumes = "application/json")
    public ResponseEntity<?> reflect(@PathVariable int id, HttpServletRequest request) {
        var user = sessions.getCurrentUser();
        var reflection = sessions.isDemoUser()
                ? aids.reflectDemo(sessions.resolveSession(request), user, id)
                : aids.reflect(user, id);
        return switch (reflection.status()) {
            case READY -> ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new Result(
                    reflection.aid(), reflection.generatedOn(), reflection.remainingToday(), reflection.since()));
            case LIMITED -> error(HttpStatus.TOO_MANY_REQUESTS, "You've used today's AI reflections");
            case NOT_FOUND -> error(HttpStatus.NOT_FOUND, "Journal entry not found");
            case UNAVAILABLE -> error(HttpStatus.SERVICE_UNAVAILABLE, "Couldn't reflect right now");
            case NOT_READY -> error(HttpStatus.CONFLICT, "Reflect with AI isn't ready for this entry yet");
            case DEMO_OWN_ENTRY -> error(HttpStatus.UNPROCESSABLE_ENTITY, "In the demo, Reflect with AI is ready on the sample entries");
        };
    }

    private static ResponseEntity<Map<String, String>> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(Map.of("error", message));
    }
}
