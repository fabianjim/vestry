package me.vestry.repository;

import me.vestry.model.AiGeneration;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AiGenerationRepository extends JpaRepository<AiGeneration, UUID> {
    Optional<AiGeneration> findByRequestKey(String key);
    List<AiGeneration> findByStatus(AiGeneration.Status status);
    long countByBudgetDay(LocalDate day);
    @Query("select coalesce(sum(g.chargedMicros), 0) from AiGeneration g")
    long totalCharged();
    @Query("select coalesce(sum(g.chargedMicros), 0) from AiGeneration g where g.budgetDay = :day")
    long chargedOn(LocalDate day);
}
