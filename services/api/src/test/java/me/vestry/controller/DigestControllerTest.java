package me.vestry.controller;

import me.vestry.model.DemoSession;
import me.vestry.model.User;
import me.vestry.security.SecurityConfig;
import me.vestry.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(DigestController.class)
@Import({SecurityConfig.class, DemoSessionResolver.class})
class DigestControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean DashboardDigestService digests;
    @MockitoBean DemoSessionStore demos;
    private final String path = "/api/portfolio/digest";

    @Test
    void requiresAuthenticationForAvailabilityReadAndGeneration() throws Exception {
        mvc.perform(get(path + "/availability")).andExpect(status().isForbidden());
        mvc.perform(get(path)).andExpect(status().isForbidden());
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(digests);
    }

    @Test
    void readsNeverGenerateAndResponsesCannotBeCachedByProxy() throws Exception {
        var user = new User(); user.setId(7);
        var auth = authentication(new UsernamePasswordAuthenticationToken(user, null, List.of()));
        when(digests.available()).thenReturn(false);
        when(digests.get(null)).thenReturn(new DashboardDigestService.State(DashboardDigestService.Status.DISABLED, LocalDate.of(2026, 10, 1), null));
        mvc.perform(get(path + "/availability").with(auth)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store")).andExpect(jsonPath("$.available").value(false));
        mvc.perform(get(path).with(auth)).andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"));
        verify(digests, never()).generate(any());
        mvc.perform(post(path).with(auth).contentType(MediaType.TEXT_PLAIN).content("{}"))
                .andExpect(status().isUnsupportedMediaType());
    }

    @Test
    void demoPostUsesResolvedSessionAndIgnoresClientOwnershipClaims() throws Exception {
        var user = new User(); user.setId(4); user.setDemo(true);
        var session = new MockHttpSession(); session.setAttribute(DemoSessionResolver.DEMO_SESSION_KEY, "digest-demo");
        var demo = new DemoSession();
        when(demos.findAndTouch("digest-demo", 4)).thenReturn(demo);
        when(digests.generate(demo)).thenReturn(new DashboardDigestService.State(DashboardDigestService.Status.GENERATING, LocalDate.of(2026, 10, 1), null));
        mvc.perform(post(path).with(authentication(new UsernamePasswordAuthenticationToken(user, null, List.of())))
                        .session(session).contentType(MediaType.APPLICATION_JSON).content("{\"userId\":99}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("GENERATING"));
        verify(digests).generate(demo);
    }
}
