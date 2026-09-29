package me.vestry.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
@Import(HoldingsLayoutService.class)
class HoldingsLayoutServiceTest {
    @Autowired HoldingsLayoutService layouts;
    @Autowired UserRepository users;
    @Autowired EntityManager entities;
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void roundTripsCompactLayoutAndKeepsAccountsSeparate() throws Exception {
        User first = users.save(new User("layout-first", "encoded"));
        User second = users.save(new User("layout-second", "encoded"));
        JsonNode defaults = layouts.get(first, null);
        JsonNode custom = mapper.readTree("{\"v\":1,\"cards\":[[\"size-return\",1],[\"relationships\",2]],\"topN\":5}");
        layouts.save(first, null, custom);
        entities.flush();
        entities.clear();
        assertEquals(custom, layouts.get(first, null));
        assertEquals(defaults, layouts.get(second, null));
        assertEquals("encoded", users.findById(first.getId()).orElseThrow().getPassword());

        JsonNode empty = mapper.readTree("{\"v\":1,\"cards\":[]}");
        layouts.save(first, null, empty);
        entities.flush();
        entities.clear();
        assertEquals(empty, layouts.get(first, null));
    }

    @Test
    void demoLayoutLivesOnlyInItsOwnSession() throws Exception {
        User demo = new User("layout-demo", "encoded");
        demo.setDemo(true);
        users.saveAndFlush(demo);
        DemoSession first = new DemoSession();
        DemoSession second = new DemoSession();
        JsonNode defaults = layouts.get(demo, second);
        JsonNode custom = mapper.readTree("{\"v\":1,\"cards\":[[\"reflection\",2]],\"topN\":2}");
        layouts.save(demo, first, custom);
        entities.flush();
        entities.clear();
        assertEquals(custom, layouts.get(demo, first));
        assertEquals(defaults, layouts.get(demo, second));
        assertNull(users.findById(demo.getId()).orElseThrow().getHoldingsLayout());
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "null", "{}", "{\"v\":2,\"cards\":[]}", "{\"v\":4294967297,\"cards\":[]}",
        "{\"v\":1,\"cards\":[[\"unknown\",1]]}", "{\"v\":1,\"cards\":[[\"sector\",3]]}",
        "{\"v\":1,\"cards\":[[\"sector\",1],[\"sector\",2]]}",
        "{\"v\":1,\"cards\":[[\"sector\",1.5]]}", "{\"v\":1,\"cards\":[null]}",
        "{\"v\":1,\"cards\":[],\"userId\":123}",
        "{\"v\":1,\"cards\":[],\"topN\":0}", "{\"v\":1,\"cards\":[],\"topN\":-1}",
        "{\"v\":1,\"cards\":[],\"topN\":1.5}", "{\"v\":1,\"cards\":[],\"topN\":null}",
        "{\"v\":1,\"cards\":[],\"topN\":4294967297}"
    })
    void rejectsMalformedLayouts(String json) throws Exception {
        JsonNode layout = mapper.readTree(json);
        assertThrows(IllegalArgumentException.class, () -> HoldingsLayoutService.validate(layout));
    }
}
