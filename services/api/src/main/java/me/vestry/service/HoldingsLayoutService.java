package me.vestry.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import me.vestry.model.DemoSession;
import me.vestry.model.User;
import me.vestry.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

@Service
@Transactional
public class HoldingsLayoutService {
    private static final Set<String> CARDS = Set.of(
            "sector", "value", "relationships", "reflection", "concentration", "unrealized", "realized", "size-return");
    private final UserRepository users;

    public HoldingsLayoutService(UserRepository users) {
        this.users = users;
    }

    @Transactional(readOnly = true)
    public JsonNode get(User user, DemoSession demo) {
        JsonNode layout = user.isDemo() ? Objects.requireNonNull(demo).getHoldingsLayout()
                : users.findById(user.getId()).orElseThrow().getHoldingsLayout();
        return layout == null ? defaultLayout() : layout.deepCopy();
    }

    public JsonNode save(User user, DemoSession demo, JsonNode layout) {
        validate(layout);
        JsonNode copy = layout.deepCopy();
        if (user.isDemo()) {
            Objects.requireNonNull(demo).setHoldingsLayout(copy);
        } else {
            users.findById(user.getId()).orElseThrow().setHoldingsLayout(copy);
        }
        return copy.deepCopy();
    }

    private static JsonNode defaultLayout() {
        var layout = JsonNodeFactory.instance.objectNode().put("v", 1);
        var cards = layout.putArray("cards");
        cards.addArray().add("sector").add(1);
        cards.addArray().add("value").add(1);
        cards.addArray().add("relationships").add(2);
        return layout;
    }

    static void validate(JsonNode layout) {
        if (layout == null || !layout.isObject() || layout.size() != (layout.has("topN") ? 3 : 2)
                || !layout.path("v").isIntegralNumber() || !layout.path("v").canConvertToInt()
                || layout.path("v").intValue() != 1
                || !layout.path("cards").isArray() || layout.path("cards").size() > CARDS.size()) {
            throw new IllegalArgumentException("Invalid holdings layout");
        }
        if (layout.has("topN") && (!layout.get("topN").isIntegralNumber()
                || !layout.get("topN").canConvertToInt() || layout.get("topN").intValue() < 1)) {
            throw new IllegalArgumentException("Top holdings must be a positive integer");
        }
        Set<String> seen = new HashSet<>();
        for (JsonNode card : layout.get("cards")) {
            if (!card.isArray() || card.size() != 2 || !card.get(0).isTextual()
                    || !CARDS.contains(card.get(0).textValue()) || !seen.add(card.get(0).textValue())
                    || !card.get(1).isIntegralNumber()
                    || !(card.get(1).intValue() == 1 || card.get(1).intValue() == 2)
                    || !card.get(1).canConvertToInt()) {
                throw new IllegalArgumentException("Invalid holdings card or size");
            }
        }
    }
}
