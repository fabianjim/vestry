package me.vestry.repository;

import me.vestry.model.PortfolioDigest;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PortfolioDigestRepository extends JpaRepository<PortfolioDigest, UUID> {
    List<PortfolioDigest> findTop3ByUserIdAndCapturedAtLessThanEqualOrderByGeneratedAtDesc(int userId, Instant capturedAt);
    Optional<PortfolioDigest> findByIdAndUserId(UUID id, int userId);
    Optional<PortfolioDigest> findFirstByUserIdOrderByGeneratedAtDesc(int userId);
}
