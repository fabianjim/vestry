package me.vestry.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.persistence.EntityManager;
import me.vestry.model.DemoSession;
import me.vestry.model.User;
import me.vestry.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
@ActiveProfiles("test")
@Import(DashboardLayoutService.class)
class DashboardLayoutServiceTest {
    @Autowired DashboardLayoutService layouts;
    @Autowired UserRepository users;
    @Autowired EntityManager entities;
    private final ObjectMapper mapper = new ObjectMapper();
    private static final String DEFAULTS = """
        {"v":1,"metrics":["value","day-change","total-pnl"],
         "showPerformance":true,"showJournal":true,"showBriefing":true}
        """;
    private static final String CUSTOM = """
        {"v":1,"metrics":["realized-pnl","unrealized-pnl","largest-weight"],
         "showPerformance":false,"showJournal":false,"showBriefing":false}
        """;

    @Test
    void persistsPreferencesWithoutChangingOtherAccountsOrHoldingsLayout() throws Exception {
        User first = new User("dashboard-first", "encoded");
        JsonNode holdings = mapper.readTree("{\"v\":1,\"cards\":[]}");
        first.setHoldingsLayout(holdings);
        users.save(first);
        User second = users.save(new User("dashboard-second", "encoded"));
        assertEquals(mapper.readTree(DEFAULTS), layouts.get(first, null));
        JsonNode custom = mapper.readTree(CUSTOM);
        layouts.save(first, null, custom);
        entities.flush();
        entities.clear();
        assertEquals(custom, layouts.get(first, null));
        assertEquals(mapper.readTree(DEFAULTS), layouts.get(second, null));
        User saved = users.findById(first.getId()).orElseThrow();
        assertEquals(holdings, saved.getHoldingsLayout());
        assertEquals("encoded", saved.getPassword());
        assertFalse(mapper.valueToTree(saved).has("dashboardLayout"));
    }

    @Test
    void demoPreferencesAreIsolatedAndDefensivelyCopied() throws Exception {
        User demo = new User("dashboard-demo", "encoded");
        demo.setDemo(true);
        users.saveAndFlush(demo);
        DemoSession first = new DemoSession();
        DemoSession second = new DemoSession();
        JsonNode custom = mapper.readTree(CUSTOM);
        JsonNode returned = layouts.save(demo, first, custom);
        ((ObjectNode) custom).put("showBriefing", true);
        ((ObjectNode) returned).put("showJournal", true);
        JsonNode fetched = layouts.get(demo, first);
        ((ObjectNode) fetched).put("showPerformance", true);
        entities.flush();
        entities.clear();
        assertEquals(mapper.readTree(CUSTOM), layouts.get(demo, first));
        assertEquals(mapper.readTree(DEFAULTS), layouts.get(demo, second));
        assertNull(users.findById(demo.getId()).orElseThrow().getDashboardLayout());
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "value", "day-change", "total-pnl", "realized-pnl", "unrealized-pnl", "holding-count", "largest-weight"
    })
    void acceptsEverySupportedMetric(String metric) throws Exception {
        ObjectNode layout = (ObjectNode) mapper.readTree(DEFAULTS);
        var metrics = layout.putArray("metrics").add(metric);
        for (String fallback : new String[] {"value", "day-change", "total-pnl"}) {
            if (!fallback.equals(metric) && metrics.size() < 3) metrics.add(fallback);
        }
        assertDoesNotThrow(() -> DashboardLayoutService.validate(layout));
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "null", "[]", "{}", "{\"v\":2}", "{\"v\":4294967297}", "{\"v\":1.0}",
        "{\"metrics\":null}", "{\"metrics\":[\"value\",\"day-change\"]}",
        "{\"metrics\":[\"value\",\"day-change\",\"total-pnl\",\"holding-count\"]}",
        "{\"metrics\":[\"value\",\"value\",\"total-pnl\"]}",
        "{\"metrics\":[\"unknown\",\"value\",\"total-pnl\"]}",
        "{\"metrics\":[null,\"value\",\"total-pnl\"]}",
        "{\"showPerformance\":\"false\"}", "{\"showJournal\":0}", "{\"showBriefing\":null}",
        "{\"userId\":123}"
    })
    void rejectsMalformedPreferencesWithoutSaving(String patch) throws Exception {
        JsonNode input = mapper.readTree(patch);
        if (input.isObject() && !input.isEmpty()) {
            input = ((ObjectNode) mapper.readTree(DEFAULTS)).setAll((ObjectNode) input);
        }
        JsonNode invalid = input;
        assertThrows(IllegalArgumentException.class, () -> layouts.save(null, null, invalid));
    }

    @ParameterizedTest
    @ValueSource(strings = {"v", "metrics", "showPerformance", "showJournal", "showBriefing"})
    void requiresEveryField(String field) throws Exception {
        ObjectNode layout = (ObjectNode) mapper.readTree(DEFAULTS);
        layout.remove(field);
        assertThrows(IllegalArgumentException.class, () -> DashboardLayoutService.validate(layout));
    }
}
