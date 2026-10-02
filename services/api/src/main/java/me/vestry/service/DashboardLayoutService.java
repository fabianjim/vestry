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
public class DashboardLayoutService {
    private static final Set<String> METRICS = Set.of(
            "value", "day-change", "total-pnl", "unrealized-pnl", "realized-pnl", "holding-count", "largest-weight");
    private final UserRepository users;

    public DashboardLayoutService(UserRepository users) {
        this.users = users;
    }

    @Transactional(readOnly = true)
    public JsonNode get(User user, DemoSession demo) {
        JsonNode layout = user.isDemo() ? Objects.requireNonNull(demo).getDashboardLayout()
                : users.findById(user.getId()).orElseThrow().getDashboardLayout();
        return layout == null ? defaultLayout() : layout.deepCopy();
    }

    public JsonNode save(User user, DemoSession demo, JsonNode layout) {
        validate(layout);
        JsonNode copy = layout.deepCopy();
        if (user.isDemo()) {
            Objects.requireNonNull(demo).setDashboardLayout(copy);
        } else {
            users.findById(user.getId()).orElseThrow().setDashboardLayout(copy);
        }
        return copy.deepCopy();
    }

    private static JsonNode defaultLayout() {
        var layout = JsonNodeFactory.instance.objectNode().put("v", 1)
                .put("showPerformance", true).put("showJournal", true).put("showBriefing", true);
        layout.putArray("metrics").add("value").add("day-change").add("total-pnl");
        return layout;
    }

    static void validate(JsonNode layout) {
        if (layout == null || !layout.isObject() || layout.size() != 5
                || !layout.path("v").isIntegralNumber() || !layout.path("v").canConvertToInt()
                || layout.path("v").intValue() != 1
                || !layout.path("metrics").isArray() || layout.path("metrics").size() != 3
                || !layout.path("showPerformance").isBoolean() || !layout.path("showJournal").isBoolean()
                || !layout.path("showBriefing").isBoolean()) {
            throw new IllegalArgumentException("Invalid dashboard layout");
        }
        Set<String> seen = new HashSet<>();
        for (JsonNode metric : layout.get("metrics")) {
            if (!metric.isTextual() || !METRICS.contains(metric.textValue()) || !seen.add(metric.textValue())) {
                throw new IllegalArgumentException("Dashboard metrics must be three distinct supported choices");
            }
        }
    }
}
