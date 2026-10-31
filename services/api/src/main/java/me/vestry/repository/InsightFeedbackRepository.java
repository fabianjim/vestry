package me.vestry.repository;

import me.vestry.model.InsightFeedback;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface InsightFeedbackRepository extends JpaRepository<InsightFeedback, Integer> {
    Optional<InsightFeedback> findByUserIdAndKindAndSubject(int userId, String kind, String subject);

    List<InsightFeedback> findTop200ByUserIdOrderByUpdatedAtDescIdDesc(int userId);
}
