package me.vestry.controller;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import me.vestry.model.BehaviorFeedback;
import me.vestry.model.BehaviorKey;
import me.vestry.service.DemoSessionResolver;
import me.vestry.service.InsightFeedbackService;
import me.vestry.service.InsightsService;
import me.vestry.service.InsightsService.OlderReports;
import me.vestry.service.InsightsService.Overview;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;

@RestController
@RequestMapping("/api/insights")
@RequiredArgsConstructor
public class InsightsController {
    private final InsightsService insights;
    private final InsightFeedbackService feedback;
    private final DemoSessionResolver sessions;

    public record FeedbackRequest(String kind, String subject, LocalDate reportDay, BehaviorFeedback.Reaction reaction,
                                  String note) {}

    @GetMapping("/availability")
    public ResponseEntity<Map<String, Boolean>> availability() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("available", insights.available()));
    }

    /** Always 200, so the page can render its unavailable state. */
    @GetMapping
    public ResponseEntity<Overview> overview() {
        var user = sessions.getCurrentUser();
        var result = sessions.isDemoUser() ? insights.overviewDemo(user) : insights.overview(user);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result);
    }

    @GetMapping("/reports")
    public ResponseEntity<OlderReports> olderReports(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate before) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(insights.olderReports(sessions.getCurrentUser(), before));
    }

    @GetMapping("/reports/{day}")
    public ResponseEntity<?> report(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate day,
                                    HttpServletRequest request) {
        var user = sessions.getCurrentUser();
        var result = sessions.isDemoUser()
                ? insights.reportDemo(sessions.resolveSession(request), user, day)
                : insights.report(user, day);
        if (result.unavailable()) return error(HttpStatus.SERVICE_UNAVAILABLE, "Couldn't load this report right now");
        if (result.report() == null) return error(HttpStatus.NOT_FOUND, "No report for that day");
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result.report());
    }

    /** Answers before the report is built; the page polls the overview while it's GENERATING. */
    @PostMapping(value = "/generate", consumes = "application/json")
    public ResponseEntity<?> generate() {
        // the demo account's report is generated daily; visitors never cause a model call
        if (sessions.isDemoUser()) return error(HttpStatus.FORBIDDEN, "In the demo, reports are prepared for you");
        var start = insights.generate(sessions.getCurrentUser());
        return switch (start.status()) {
            case STARTED -> ResponseEntity.accepted().cacheControl(CacheControl.noStore()).body(Map.of("status", "GENERATING"));
            case BLOCKED -> ResponseEntity.status(HttpStatus.CONFLICT).cacheControl(CacheControl.noStore())
                    .body(Map.of("error", "A new report isn't available yet", "blockedReason", start.blockedReason().name()));
            case UNAVAILABLE -> error(HttpStatus.SERVICE_UNAVAILABLE, "Couldn't generate a report right now");
        };
    }

    /** A visitor's reaction stays in their session. */
    @PutMapping(value = "/feedback", consumes = "application/json")
    public ResponseEntity<?> feedback(@RequestBody FeedbackRequest body, HttpServletRequest request) {
        try {
            var behavior = new BehaviorKey(body.kind(), body.subject());
            var saved = sessions.isDemoUser()
                    ? feedback.saveDemo(sessions.resolveSession(request), behavior, body.reportDay(), body.reaction(), body.note())
                    : feedback.save(sessions.getCurrentUser(), behavior, body.reportDay(), body.reaction(), body.note());
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(saved);
        } catch (IllegalArgumentException invalid) {
            return error(HttpStatus.BAD_REQUEST, invalid.getMessage());
        }
    }

    private static ResponseEntity<Map<String, String>> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(Map.of("error", message));
    }
}
