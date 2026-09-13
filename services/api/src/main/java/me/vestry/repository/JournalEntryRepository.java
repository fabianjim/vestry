package me.vestry.repository;

import me.vestry.model.JournalEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface JournalEntryRepository extends JpaRepository<JournalEntry, Integer> {

    // Creation and deletion lock the same source to avoid links to a deleted entry.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from JournalEntry e where e.id = :id and e.user.id = :userId")
    Optional<JournalEntry> findOwnedEntryForUpdate(@Param("id") int id, @Param("userId") int userId);

    List<JournalEntry> findByUserIdAndSourceEntryId(int userId, int sourceEntryId);

    List<JournalEntry> findByUserIdOrderByTimestampDesc(int userId);

    List<JournalEntry> findByUserIdAndTicker(int userId, String ticker);

    List<JournalEntry> findByUserIdAndTimestampBetween(int userId, Instant start, Instant end);
}
