package me.vestry.service;

import me.vestry.api.HindsightClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Savepoint;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EntryEventsTest {
    @Mock HindsightClient hindsight;
    @Mock DataSource dataSource;
    @Mock Connection connection;
    @Mock PreparedStatement statement;
    @Mock Savepoint savepoint;
    EntryEvents events;

    @BeforeEach
    void setUp() {
        events = new EntryEvents(hindsight, new JdbcTemplate(dataSource));
    }

    @Test
    void sendsOnlyTheIdInsideASavepoint() throws SQLException {
        connect();
        when(connection.prepareStatement(EntryEvents.SEND)).thenReturn(statement);

        events.changed(7);

        verify(statement).setString(1, "{\"entryId\":7}");
        verify(statement).execute();
        verify(connection).releaseSavepoint(savepoint);
        verify(connection, never()).rollback(any(Savepoint.class));
    }

    @Test
    void failedSendRollsBackToTheSavepointAndNeverThrows() throws SQLException {
        connect();
        when(connection.prepareStatement(EntryEvents.SEND)).thenReturn(statement);
        when(statement.execute()).thenThrow(new SQLException("relation \"pgmq.q_entry_events\" does not exist", "42P01"));

        assertDoesNotThrow(() -> events.changed(7));

        // without this, postgres would abort the transaction that saves the entry
        verify(connection).rollback(savepoint);
        verify(connection, never()).releaseSavepoint(any());
    }

    @Test
    void disabledHindsightSendsNothing() {
        when(hindsight.isEnabled()).thenReturn(false);

        events.changed(7);

        verifyNoInteractions(dataSource);
    }

    private void connect() throws SQLException {
        when(hindsight.isEnabled()).thenReturn(true);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.setSavepoint()).thenReturn(savepoint);
    }
}
