package me.vestry.controller;

import me.vestry.api.HindsightClient.AidResponse;
import me.vestry.api.HindsightClient.AidResult;
import me.vestry.api.HindsightClient.AidStatus;
import me.vestry.api.HindsightClient.ReflectionAid;
import me.vestry.api.HindsightClient.Since;
import me.vestry.api.HindsightClient.Trade;
import me.vestry.model.User;
import me.vestry.security.SecurityConfig;
import me.vestry.service.DemoSessionResolver;
import me.vestry.service.DemoSessionStore;
import me.vestry.service.ReflectionAidService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.time.LocalDate;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ReflectionAidController.class)
@Import({SecurityConfig.class, DemoSessionResolver.class})
class ReflectionAidControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean ReflectionAidService aids;
    @MockitoBean DemoSessionStore demos;

    private static final String URL = "/api/journal/entries/7/reflect-with-ai";
    private static final Since SINCE = new Since(142.3, 15.0, List.of(new Trade(LocalDate.of(2026, 3, 4), "BUY", 5, 131.2)));

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
        mvc.perform(get("/api/journal/reflect-with-ai/availability")).andExpect(status().isForbidden());
        mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
        verifyNoInteractions(aids);
    }

    @Test
    void returnsTheAidWithVestrysOwnFacts() throws Exception {
        var aid = new ReflectionAid(List.of(), List.of("What made this look like a dip?"));
        when(aids.reflect(any(), anyInt())).thenReturn(new ReflectionAidService.Reflection(
                new AidResponse(AidStatus.READY, new AidResult(aid, LocalDate.of(2026, 10, 25), 9)), SINCE));

        mvc.perform(post(URL).with(as(user(false))).contentType(MediaType.APPLICATION_JSON).content("{\"userId\":99}"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.aid.questions[0]").value("What made this look like a dip?"))
                .andExpect(jsonPath("$.generatedOn").value("2026-10-25"))
                .andExpect(jsonPath("$.remainingToday").value(9))
                .andExpect(jsonPath("$.since.priceNow").value(142.3))
                .andExpect(jsonPath("$.since.trades[0].day").value("2026-03-04"));
        // the user comes from the session, never the body
        verify(aids).reflect(argThat(u -> u.getId() == 4), eq(7));
    }

    @ParameterizedTest
    @CsvSource({"LIMITED, 429", "NOT_FOUND, 404", "UNAVAILABLE, 503"})
    void mapsEachOutcomeToAStatus(AidStatus outcome, int code) throws Exception {
        when(aids.reflect(any(), anyInt())).thenReturn(new ReflectionAidService.Reflection(AidResponse.of(outcome), SINCE));

        mvc.perform(post(URL).with(as(user(false))).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().is(code))
                .andExpect(jsonPath("$.error").exists());
    }

    @Test
    void postMustBeJson() throws Exception {
        mvc.perform(post(URL).with(as(user(false))).contentType(MediaType.TEXT_PLAIN).content("{}"))
                .andExpect(status().isUnsupportedMediaType());
        verifyNoInteractions(aids);
    }

    @Test
    void availabilityFollowsHindsight() throws Exception {
        when(aids.available()).thenReturn(true);
        mvc.perform(get("/api/journal/reflect-with-ai/availability").with(as(user(false))))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.available").value(true));
    }

    @Test
    void demoVisitorsCannotUseItYet() throws Exception {
        var demo = user(true);
        var session = new MockHttpSession();
        session.setAttribute(DemoSessionResolver.DEMO_SESSION_KEY, "demo");
        when(demos.findAndTouch("demo", 4)).thenReturn(new me.vestry.model.DemoSession());
        when(aids.available()).thenReturn(true);

        mvc.perform(get("/api/journal/reflect-with-ai/availability").with(as(demo)).session(session))
                .andExpect(jsonPath("$.available").value(false));
        mvc.perform(post(URL).with(as(demo)).session(session).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        verify(aids, never()).reflect(any(), anyInt());
    }
}
