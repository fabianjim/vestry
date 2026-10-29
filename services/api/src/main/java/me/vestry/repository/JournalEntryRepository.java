package me.vestry.repository;

import me.vestry.model.JournalEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface JournalEntryRepository extends JpaRepository<JournalEntry, Integer> {

    // Creation and deletion lock the same source to avoid links to a deleted entry.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from JournalEntry e where e.id = :id and e.user.id = :userId")
    Optional<JournalEntry> findOwnedEntryForUpdate(@Param("id") int id, @Param("userId") int userId);

    List<JournalEntry> findByUserIdAndSourceEntryId(int userId, int sourceEntryId);

    @Query("select e.id from JournalEntry e where e.user.id = :userId and e.id in :ids")
    List<Integer> findOwnedIds(@Param("userId") int userId, @Param("ids") Collection<Integer> ids);

    List<JournalEntry> findTop6ByUserIdOrderByTimestampDescIdDesc(int userId);

    List<JournalEntry> findTop500ByUserIdAndBehaviorKeyIsNotNullOrderByTimestampDescIdDesc(int userId);

    List<JournalEntry> findByUserIdOrderByTimestampDesc(int userId);

    List<JournalEntry> findByUserIdAndTicker(int userId, String ticker);

    List<JournalEntry> findByUserIdAndTimestampGreaterThanEqualAndTimestampLessThan(int userId, Instant start, Instant end);

    List<JournalEntry> findByUserIdAndTimestampBetween(int userId, Instant start, Instant end);

    @Query("select e.user.id as userId, e.ticker as ticker, e.timestamp as timestamp from JournalEntry e"
            + " where e.entryType = me.vestry.model.JournalEntryType.BUY and e.body = :body and e.ticker is not null")
    List<TickerMoment> findBuyEntriesWithBody(@Param("body") String body);
}
