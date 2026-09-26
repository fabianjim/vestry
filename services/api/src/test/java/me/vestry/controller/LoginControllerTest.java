package me.vestry.controller;

import jakarta.servlet.http.Cookie;
import me.vestry.model.DemoSession;
import me.vestry.model.Holding;
import me.vestry.model.JournalEntry;
import me.vestry.model.Portfolio;
import me.vestry.model.User;
import me.vestry.repository.UserRepository;
import me.vestry.security.SecurityConfig;
import me.vestry.service.DemoSessionResolver;
import me.vestry.service.DemoSessionService;
import me.vestry.service.DemoSessionStore;
import me.vestry.service.PortfolioService;
import me.vestry.service.TransactionService;
import me.vestry.service.NasdaqMetadataService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.web.ServerProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest({LoginController.class, PortfolioController.class})
@Import({SecurityConfig.class, DemoSessionResolver.class, DemoSessionStore.class})
@EnableConfigurationProperties(ServerProperties.class)
@ActiveProfiles("prod")
class LoginControllerTest {
    @Autowired private MockMvc mvc;
    @Autowired private PasswordEncoder encoder;
    @MockitoSpyBean private DemoSessionStore store;
    @MockitoBean private UserRepository users;
    @MockitoBean private DemoSessionService demos;
    @MockitoBean private PortfolioService portfolios;
    @MockitoBean private TransactionService transactions;
    @MockitoBean private NasdaqMetadataService metadata;
    private User demoUser;

    @Test
    void creationDiscardsClientIdentitiesForRegularAndDemoUsers() throws Exception {
        for (String username : java.util.List.of("regular", "demo")) {
            mvc.perform(post("/api/portfolio/create").session(session(login(username, null, null)))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""
                        {"id":999,"user":{"id":999},"holdings":[
                          {"id":888,"ticker":"AAPL","shares":2,"buyTimestamp":"2000-01-01T00:00:00Z"}
                        ]}
                        """))
                    .andExpect(status().isOk());
            var captor = org.mockito.ArgumentCaptor.forClass(Portfolio.class);
            if (username.equals("demo")) verify(demos).createPortfolio(any(), eq(demoUser), captor.capture());
            else verify(portfolios).createPortfolio(captor.capture());
            Portfolio input = captor.getValue();
            assertEquals(0, input.getId());
            assertNull(input.getUser());
            assertEquals(0, input.getHoldings().get(0).getId());
            assertEquals("AAPL", input.getHoldings().get(0).getTicker());
            assertEquals(2, input.getHoldings().get(0).getShares());
            assertNotEquals(java.time.Instant.parse("2000-01-01T00:00:00Z"), input.getHoldings().get(0).getBuyTimestamp());
        }
    }

    @BeforeEach
    void setUp() {
        demoUser = new User("demo", encoder.encode("password"));
        demoUser.setId(1);
        demoUser.setDemo(true);
        User regular = new User("regular", demoUser.getPassword());
        regular.setId(2);
        when(users.findByUsername("demo")).thenReturn(Optional.of(demoUser));
        when(users.findByUsername("regular")).thenReturn(Optional.of(regular));
        when(demos.createSession(demoUser)).thenAnswer(invocation -> new DemoSession());
    }

    @Test
    void logoutAndRegularAccountUsePreserveTheDemoAndRotateAuthenticationSessions() throws Exception {
        MvcResult first = login("demo", null, null);
        MockHttpSession original = session(first);
        Cookie cookie = first.getResponse().getCookie("VESTRY_DEMO");
        assertNotNull(cookie);
        assertTrue(cookie.isHttpOnly());
        assertTrue(cookie.getSecure()); // Production proxy reaches the backend over HTTP.
        assertEquals("Lax", cookie.getAttribute("SameSite"));
        assertEquals("/api", cookie.getPath());
        assertEquals(1800, cookie.getMaxAge());
        assertEquals(1800, original.getMaxInactiveInterval());
        DemoSession retained = store.findAndTouch(cookie.getValue(), 1);
        retained.setRemainingTrades(2);
        Portfolio portfolio = new Portfolio();
        portfolio.setHoldings(new java.util.ArrayList<>(java.util.List.of(new Holding("AAPL", 2))));
        retained.setPortfolio(portfolio);
        retained.getJournalEntries().add(new JournalEntry());

        mvc.perform(get("/api/auth/me").session(original)).andExpect(status().isOk());
        mvc.perform(post("/api/auth/logout").session(original)).andExpect(status().is3xxRedirection());
        assertTrue(original.isInvalid());
        mvc.perform(get("/api/auth/me").cookie(cookie)).andExpect(status().isUnauthorized());

        clearInvocations(store);
        MvcResult regular = login("regular", null, cookie);
        MockHttpSession regularSession = session(regular);
        assertEquals(7200, regularSession.getMaxInactiveInterval());
        mvc.perform(get("/api/auth/me").session(regularSession))
                .andExpect(jsonPath("username").value("regular"));
        mvc.perform(post("/api/auth/logout").session(regularSession)).andExpect(status().is3xxRedirection());
        assertTrue(regularSession.isInvalid());
        verify(store, never()).findAndTouch(any(), anyInt());
        verify(store, never()).resume(any(), any());
        MvcResult resumed = login("demo", null, cookie);
        assertNotEquals(original.getId(), session(resumed).getId());
        assertEquals(cookie.getValue(), resumed.getResponse().getCookie("VESTRY_DEMO").getValue());
        DemoSession restored = store.findAndTouch(cookie.getValue(), 1);
        assertSame(retained, restored);
        assertEquals(2, restored.getRemainingTrades());
        assertEquals("AAPL", restored.getPortfolio().getHoldings().get(0).getTicker());
        assertEquals(1, restored.getJournalEntries().size());
        mvc.perform(get("/api/portfolio/demo-status").session(session(resumed)))
                .andExpect(status().isOk()).andExpect(jsonPath("remainingTrades").value(2));
        verify(demos, times(1)).createSession(demoUser);
        verify(demos, never()).stopTrackingStockForSession(any(), any());
    }

    @Test
    void repeatedLoginReusesDemoButFailedLoginDoesNotChangeAuthentication() throws Exception {
        MvcResult first = login("demo", null, null);
        Cookie cookie = first.getResponse().getCookie("VESTRY_DEMO");
        MockHttpSession firstSession = session(first);
        MvcResult repeated = login("demo", firstSession, cookie);
        assertTrue(firstSession.isInvalid());
        assertEquals(cookie.getValue(), repeated.getResponse().getCookie("VESTRY_DEMO").getValue());
        mvc.perform(post("/api/auth/login").session(session(repeated))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"regular\",\"password\":\"wrong\"}"))
                .andExpect(status().isBadRequest());
        assertFalse(session(repeated).isInvalid());
        mvc.perform(get("/api/auth/me").session(session(repeated)))
                .andExpect(jsonPath("username").value("demo"));
        MockHttpSession repeatedSession = session(repeated);
        MvcResult regular = login("regular", repeatedSession, cookie);
        assertTrue(repeatedSession.isInvalid());
        assertEquals(7200, session(regular).getMaxInactiveInterval());
        MvcResult resumed = login("demo", session(regular), cookie);
        assertEquals(cookie.getValue(), resumed.getResponse().getCookie("VESTRY_DEMO").getValue());
        verify(demos, times(1)).createSession(demoUser);
    }

    @Test
    void cookieAloneCannotAuthenticateAndMissingDemoCannotServeProtectedData() throws Exception {
        MvcResult first = login("demo", null, null);
        Cookie cookie = first.getResponse().getCookie("VESTRY_DEMO");
        mvc.perform(get("/api/auth/me").cookie(cookie)).andExpect(status().isUnauthorized());
        MockHttpSession authenticated = session(first);
        authenticated.setAttribute(DemoSessionResolver.DEMO_SESSION_KEY, "expired-or-lost");
        mvc.perform(get("/api/auth/me").session(authenticated)).andExpect(status().isUnauthorized());
        assertTrue(authenticated.isInvalid());
        MvcResult fresh = login("demo", null, new Cookie("VESTRY_DEMO", "expired-or-lost"));
        assertNotEquals("expired-or-lost", fresh.getResponse().getCookie("VESTRY_DEMO").getValue());
    }

    @Test
    void anonymousSessionStatusIsSuccessfulWithoutCreatingASession() throws Exception {
        MvcResult result = mvc.perform(get("/api/auth/session-status"))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"authenticated\":false}"))
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                .andReturn();
        assertNull(result.getRequest().getSession(false));
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void sessionStatusRecognizesRegularAndDemoLoginsButNotADemoCookieAlone() throws Exception {
        for (String username : java.util.List.of("regular", "demo")) {
            MvcResult authenticated = login(username, null, null);
            mvc.perform(get("/api/auth/session-status").session(session(authenticated)))
                    .andExpect(status().isOk())
                    .andExpect(content().json("{\"authenticated\":true}"));
            Cookie demoCookie = authenticated.getResponse().getCookie("VESTRY_DEMO");
            if (demoCookie != null) {
                mvc.perform(get("/api/auth/session-status").cookie(demoCookie))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("authenticated").value(false));
            }
        }
    }

    private MvcResult login(String username, MockHttpSession session, Cookie cookie) throws Exception {
        var request = post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"" + username + "\",\"password\":\"password\"}");
        if (session != null) request.session(session);
        if (cookie != null) request.cookie(cookie);
        return mvc.perform(request).andExpect(status().isOk()).andReturn();
    }

    private MockHttpSession session(MvcResult result) {
        return (MockHttpSession) result.getRequest().getSession(false);
    }
}
