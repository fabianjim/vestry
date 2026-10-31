package me.vestry.controller;

import me.vestry.model.BehaviorFeedback;
import me.vestry.model.BehaviorFeedback.Reaction;
import me.vestry.model.BehaviorKey;
import me.vestry.model.DemoSession;
import me.vestry.model.User;
import me.vestry.security.SecurityConfig;
import me.vestry.service.DemoSessionResolver;
import me.vestry.service.DemoSessionStore;
import me.vestry.service.InsightFeedbackService;
import me.vestry.service.InsightGate;
import me.vestry.service.InsightsService;
import me.vestry.service.InsightsService.ReportResult;
import me.vestry.service.InsightsService.ReportView;
import me.vestry.service.InsightsService.Start;
import me.vestry.service.InsightsService.StartStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.same;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(InsightsController.class)
@Import({SecurityConfig.class, DemoSessionResolver.class})
class InsightsControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean InsightsService insights;
    @MockitoBean InsightFeedbackService feedback;
    @MockitoBean DemoSessionStore demos;

    private static final LocalDate DAY = LocalDate.of(2026, 10, 28);
    private static final ReportView REPORT = new ReportView(DAY, Instant.parse("2026-10-28T14:10:00Z"), DAY,
            Instant.parse("2026-10-28T13:58:00Z"), List.of(), List.of());
    private static final String FEEDBACK = """
            {"kind": "emotional", "subject": "anxious", "reportDay": "2026-10-28", "reaction": "FITS", "note": "true"}
            """;

    private static RequestPostProcessor as(User user) {
        return authentication(new UsernamePasswordAuthenticationToken(user, null, List.of()));
    }

    private static User user(boolean demo) {
        var user = new User();
        user.setId(4);
        user.setDemo(demo);
        return user;
    }

    private DemoSession demoSession(MockHttpSession session) {
        session.setAttribute(DemoSessionResolver.DEMO_SESSION_KEY, "demo");
        var demoSession = new DemoSession();
        when(demos.findAndTouch("demo", 4)).thenReturn(demoSession);
        return demoSession;
    }

    @Test
    void requiresAuthentication() throws Exception {
        mvc.perform(get("/api/insights/availability")).andExpect(status().isForbidden());
        mvc.perform(get("/api/insights")).andExpect(status().isForbidden());
        mvc.perform(post("/api/insights/generate").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(insights);
    }

    @Test
    void availabilityFollowsHindsight() throws Exception {
        when(insights.available()).thenReturn(true);

        mvc.perform(get("/api/insights/availability").with(as(user(false))))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.available").value(true));
    }

    @Test
    void generateAnswersBeforeTheReportIsBuilt() throws Exception {
        when(insights.generate(any())).thenReturn(new Start(StartStatus.STARTED, null),
                new Start(StartStatus.BLOCKED, InsightGate.Blocked.NOTHING_NEW), new Start(StartStatus.UNAVAILABLE, null));

        mvc.perform(post("/api/insights/generate").with(as(user(false))).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isAccepted()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.status").value("GENERATING"));
        mvc.perform(post("/api/insights/generate").with(as(user(false))).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isConflict()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.blockedReason").value("NOTHING_NEW"))
                .andExpect(jsonPath("$.error").exists());
        mvc.perform(post("/api/insights/generate").with(as(user(false))).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isServiceUnavailable()).andExpect(header().string("Cache-Control", "no-store"));
    }

    @Test
    void generateMustBeJson() throws Exception {
        mvc.perform(post("/api/insights/generate").with(as(user(false))).contentType(MediaType.TEXT_PLAIN).content("{}"))
                .andExpect(status().isUnsupportedMediaType());
        verifyNoInteractions(insights);
    }

    @Test
    void demoVisitorsCannotGenerate() throws Exception {
        var session = new MockHttpSession();
        demoSession(session);

        mvc.perform(post("/api/insights/generate").with(as(user(true))).session(session)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("In the demo, reports are prepared for you"));
        verify(insights, never()).generate(any());
    }

    @Test
    void readsADaysReportOrSaysWhyNot() throws Exception {
        when(insights.report(any(), eq(DAY))).thenReturn(new ReportResult(REPORT, false), new ReportResult(null, false),
                new ReportResult(null, true));

        mvc.perform(get("/api/insights/reports/2026-10-28").with(as(user(false))))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.day").value("2026-10-28"));
        mvc.perform(get("/api/insights/reports/2026-10-28").with(as(user(false))))
                .andExpect(status().isNotFound()).andExpect(header().string("Cache-Control", "no-store"));
        mvc.perform(get("/api/insights/reports/2026-10-28").with(as(user(false))))
                .andExpect(status().isServiceUnavailable()).andExpect(header().string("Cache-Control", "no-store"));
    }

    @Test
    void feedbackFromAUserIsSaved() throws Exception {
        var behavior = new BehaviorKey("emotional", "anxious");
        when(feedback.save(argThat(u -> u.getId() == 4), eq(behavior), eq(DAY), eq(Reaction.FITS), eq("true")))
                .thenReturn(new BehaviorFeedback(behavior, DAY, Reaction.FITS, "true", Instant.parse("2026-10-29T15:00:00Z")));

        mvc.perform(put("/api/insights/feedback").with(as(user(false))).contentType(MediaType.APPLICATION_JSON).content(FEEDBACK))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.reaction").value("FITS"));
        verify(feedback, never()).saveDemo(any(), any(), any(), any(), any());
    }

    @Test
    void feedbackFromADemoVisitorStaysInTheirSession() throws Exception {
        var session = new MockHttpSession();
        var demoSession = demoSession(session);

        mvc.perform(put("/api/insights/feedback").with(as(user(true))).session(session)
                        .contentType(MediaType.APPLICATION_JSON).content(FEEDBACK))
                .andExpect(status().isOk());
        verify(feedback).saveDemo(same(demoSession), eq(new BehaviorKey("emotional", "anxious")), eq(DAY),
                eq(Reaction.FITS), eq("true"));
        verify(feedback, never()).save(any(), any(), any(), any(), any());
    }

    @Test
    void invalidBehaviorOrNoteIsABadRequest() throws Exception {
        mvc.perform(put("/api/insights/feedback").with(as(user(false))).contentType(MediaType.APPLICATION_JSON)
                        .content(FEEDBACK.replace("\"emotional\"", "\"Not A Kind\"")))
                .andExpect(status().isBadRequest()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.error").value("Unknown behavior"));
        verifyNoInteractions(feedback);

        when(feedback.save(any(), any(), any(), any(), any())).thenThrow(new IllegalArgumentException("A note can be at most 1000 characters"));
        mvc.perform(put("/api/insights/feedback").with(as(user(false))).contentType(MediaType.APPLICATION_JSON).content(FEEDBACK))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("A note can be at most 1000 characters"));
    }
}
