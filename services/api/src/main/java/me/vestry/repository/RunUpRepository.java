package me.vestry.repository;

import me.vestry.model.RunUp;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface RunUpRepository extends JpaRepository<RunUp, RunUp.Key> {
}
