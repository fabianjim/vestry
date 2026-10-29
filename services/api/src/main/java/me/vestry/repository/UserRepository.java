package me.vestry.repository;

import me.vestry.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;
import java.util.List;

@Repository
public interface UserRepository extends JpaRepository<User, Integer> {
    
    List<User> findByDemoTrue();

    Optional<User> findByUsername(String username);

    Optional<User> findByGoogleSubject(String googleSubject);
    
    boolean existsByUsername(String username);

    boolean existsByUsernameIgnoreCase(String username);

    List<User> findAllByUsernameIgnoreCase(String username);

    /** A single update, so concurrent changes can't race, and the User entity never writes the column. */
    @Transactional
    @Modifying
    @Query(value = "update users set insight_inputs_changed_at = :at where id = :userId", nativeQuery = true)
    void markInsightInputsChanged(@Param("userId") int userId, @Param("at") Instant at);

    @Transactional
    @Modifying
    @Query(value = "update users set insight_report_facts_at = :at where id = :userId", nativeQuery = true)
    void markInsightReportFacts(@Param("userId") int userId, @Param("at") Instant at);

    interface InsightGateTimes {
        Instant getInputsChangedAt();
        Instant getReportFactsAt();
    }

    @Query("select u.insightInputsChangedAt as inputsChangedAt, u.insightReportFactsAt as reportFactsAt"
            + " from User u where u.id = :userId")
    Optional<InsightGateTimes> findInsightGate(@Param("userId") int userId);
}
