package me.vestry.repository;

import jakarta.persistence.LockModeType;
import me.vestry.model.AiBudget;
import org.springframework.data.jpa.repository.*;
import java.util.Optional;

public interface AiBudgetRepository extends JpaRepository<AiBudget, Integer> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select b from AiBudget b where b.id = 1")
    Optional<AiBudget> lockBudget();
}
