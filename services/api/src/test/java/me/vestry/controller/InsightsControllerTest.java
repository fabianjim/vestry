package me.vestry.controller;

import me.vestry.model.DemoSession;
import me.vestry.model.User;
import me.vestry.security.SecurityConfig;
import me.vestry.service.DemoSessionResolver;
import me.vestry.service.DemoSessionStore;
import me.vestry.service.InsightsService;
import me.vestry.service.InsightsService.Insights;
import me.vestry.service.InsightsService.Report;
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
import static org.mockito.ArgumentMatchers.same;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(InsightsController.class)
@Import({SecurityConfig.class, DemoSessionResolver.class})
class InsightsControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean InsightsService insights;
    @MockitoBean DemoSessionStore demos;

    private static final Report REPORT = new Report(LocalDate.of(2026, 10, 26), LocalDate.of(2026, 10, 26),
            Instant.parse("2026-10-26T14:03:00Z"), true, List.of(), List.of());

    private static RequestPostProcessor as(User user) {
        return authentication(new UsernamePasswordAuthenticationToken(user, null, List.of()));
    }

    private static User user(boolean demo) {
        var user = new User();
        user.setId(4);
        user.setDemo(demo);
        return user;
    }

    @Test
    void requiresAuthentication() throws Exception {
        mvc.perform(get("/api/insights/availability")).andExpect(status().isForbidden());
        mvc.perform(get("/api/insights")).andExpect(status().isForbidden());
        mvc.perform(post("/api/insights/refresh").contentType(MediaType.APPLICATION_JSON).content("{}"))
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
    void readsTheReportAndStillAnswersWhenHindsightIsDown() throws Exception {
        when(insights.report(any())).thenReturn(new Insights(REPORT, true, false));
        mvc.perform(get("/api/insights").with(as(user(false))))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.report.generatedOn").value("2026-10-26"))
                .andExpect(jsonPath("$.canRefresh").value(true));

        when(insights.report(any())).thenReturn(new Insights(null, false, true));
        mvc.perform(get("/api/insights").with(as(user(false))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unavailable").value(true));
    }

    @Test
    void refreshReturnsTheReportOrAQuietError() throws Exception {
        when(insights.refresh(any())).thenReturn(new Insights(REPORT, false, false));
        mvc.perform(post("/api/insights/refresh").with(as(user(false))).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.canRefresh").value(false));

        when(insights.refresh(any())).thenReturn(null);
        mvc.perform(post("/api/insights/refresh").with(as(user(false))).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("Couldn't refresh Insights right now"));
    }

    @Test
    void refreshMustBeJson() throws Exception {
        mvc.perform(post("/api/insights/refresh").with(as(user(false))).contentType(MediaType.TEXT_PLAIN).content("{}"))
                .andExpect(status().isUnsupportedMediaType());
        verifyNoInteractions(insights);
    }

    @Test
    void demoVisitorsReadThePreparedReportAndCannotRefresh() throws Exception {
        var demo = user(true);
        var session = new MockHttpSession();
        session.setAttribute(DemoSessionResolver.DEMO_SESSION_KEY, "demo");
        var demoSession = new DemoSession();
        when(demos.findAndTouch("demo", 4)).thenReturn(demoSession);
        when(insights.reportDemo(same(demoSession), argThat(u -> u.getId() == 4))).thenReturn(new Insights(REPORT, false, false));

        mvc.perform(get("/api/insights").with(as(demo)).session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.canRefresh").value(false));
        mvc.perform(post("/api/insights/refresh").with(as(demo)).session(session)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("In the demo, Insights are prepared for you"));
        verify(insights, never()).report(any());
        verify(insights, never()).refresh(any());
    }
}
