package me.vestry.repository;

import me.vestry.model.PortfolioDigest;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface PortfolioDigestRepository extends JpaRepository<PortfolioDigest, UUID> {
    Optional<PortfolioDigest> findByIdAndUserId(UUID id, int userId);
    Optional<PortfolioDigest> findFirstByUserIdOrderByGeneratedAtDesc(int userId);
}
