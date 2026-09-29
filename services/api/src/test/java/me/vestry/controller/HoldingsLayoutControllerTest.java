package me.vestry.controller;

import me.vestry.model.DemoSession;
import me.vestry.model.User;
import me.vestry.repository.UserRepository;
import me.vestry.security.SecurityConfig;
import me.vestry.service.DemoSessionResolver;
import me.vestry.service.DemoSessionStore;
import me.vestry.service.HoldingsLayoutService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(HoldingsLayoutController.class)
@Import({SecurityConfig.class, DemoSessionResolver.class, HoldingsLayoutService.class})
class HoldingsLayoutControllerTest {
    private static final String PATH = "/api/portfolio/holdings-layout";
    private static final String LAYOUT = "{\"v\":1,\"cards\":[[\"reflection\",2]]}";
    @Autowired MockMvc mvc;
    @MockitoBean UserRepository users;
    @MockitoBean DemoSessionStore demos;

    @Test
    void requiresAuthentication() throws Exception {
        mvc.perform(get(PATH)).andExpect(status().isForbidden());
        mvc.perform(put(PATH).contentType(MediaType.APPLICATION_JSON).content(LAYOUT))
                .andExpect(status().isForbidden());
        verifyNoInteractions(users);
    }

    @Test
    void readsAndWritesOnlyTheAuthenticatedUsersLayout() throws Exception {
        User user = new User("owner", "encoded");
        user.setId(12);
        when(users.findById(12)).thenReturn(Optional.of(user));
        var auth = authentication(new UsernamePasswordAuthenticationToken(user, null, List.of()));
        mvc.perform(put(PATH).with(auth).contentType(MediaType.APPLICATION_JSON).content(LAYOUT))
                .andExpect(status().isOk()).andExpect(jsonPath("$.cards[0][0]").value("reflection"));
        mvc.perform(get(PATH).with(auth)).andExpect(status().isOk())
                .andExpect(jsonPath("$.cards[0][1]").value(2));
        mvc.perform(put(PATH).with(auth).contentType(MediaType.APPLICATION_JSON)
                .content("{\"v\":1,\"cards\":[],\"userId\":99}"))
                .andExpect(status().isBadRequest());
        assertEquals("reflection", user.getHoldingsLayout().get("cards").get(0).get(0).asText());
        verify(users, times(2)).findById(12);
        verifyNoMoreInteractions(users);
    }

    @Test
    void demoUsesResolvedSessionWithoutTouchingTheUserTable() throws Exception {
        User user = new User("demo", "encoded");
        user.setId(4);
        user.setDemo(true);
        var session = new MockHttpSession();
        session.setAttribute(DemoSessionResolver.DEMO_SESSION_KEY, "demo-layout");
        var demo = new DemoSession();
        when(demos.findAndTouch("demo-layout", 4)).thenReturn(demo);
        var auth = authentication(new UsernamePasswordAuthenticationToken(user, null, List.of()));
        mvc.perform(put(PATH).with(auth).session(session).contentType(MediaType.APPLICATION_JSON).content(LAYOUT))
                .andExpect(status().isOk());
        mvc.perform(get(PATH).with(auth).session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.cards[0][0]").value("reflection"));
        assertNotNull(demo.getHoldingsLayout());
        assertNull(user.getHoldingsLayout());
        verifyNoInteractions(users);
    }
}
