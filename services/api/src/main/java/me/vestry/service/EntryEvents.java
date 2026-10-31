package me.vestry.service;

import me.vestry.api.HindsightClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.SQLException;

/**
 * Tells hindsight an entry changed, through its pgmq queue, so Insights see it within seconds.
 * Only a fast path: hindsight's hourly sweep is the guarantee, so a failure here is logged and dropped.
 */
@Component
public class EntryEvents {
    private static final Logger log = LoggerFactory.getLogger(EntryEvents.class);
    static final String SEND = "select pgmq.send('entry_events', cast(? as jsonb))";

    private final HindsightClient hindsight;
    private final JdbcTemplate jdbc;

    public EntryEvents(HindsightClient hindsight, JdbcTemplate jdbc) {
        this.hindsight = hindsight;
        this.jdbc = jdbc;
    }

    /**
     * Runs in the caller's transaction, so the message commits with the entry. JDBC rather than a native
     * query: Hibernate would flush pending entity changes inside the savepoint, and rolling it back would
     * silently drop them. The savepoint keeps a failed send from aborting the Postgres transaction.
     */
    public void changed(int entryId) {
        if (!hindsight.isEnabled()) return;
        try {
            jdbc.execute((ConnectionCallback<Void>) connection -> {
                var savepoint = connection.setSavepoint();
                try (var statement = connection.prepareStatement(SEND)) {
                    statement.setString(1, "{\"entryId\":" + entryId + "}");
                    statement.execute();
                } catch (SQLException e) {
                    connection.rollback(savepoint);
                    throw e;
                }
                connection.releaseSavepoint(savepoint);
                return null;
            });
        } catch (RuntimeException e) {
            // IDs only: the SQL carries no entry text
            log.warn("Couldn't queue entry {} for hindsight: {}", entryId, NestedExceptionUtils.getMostSpecificCause(e).toString());
        }
    }
}
