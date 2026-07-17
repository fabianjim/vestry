package com.github.fabianjim.portfoliomonitor.repository;

import com.github.fabianjim.portfoliomonitor.model.Tag;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TagRepository extends JpaRepository<Tag, Integer> {

    List<Tag> findByUserId(int userId);

    Optional<Tag> findByUserIdAndName(int userId, String name);

    @Query("SELECT t FROM Tag t LEFT JOIN t.entries e WHERE t.user.id = :userId AND LOWER(t.name) LIKE LOWER(CONCAT(:prefix, '%')) GROUP BY t ORDER BY COUNT(e) DESC, t.name ASC")
    List<Tag> findTopTagsByUserAndPrefix(@Param("userId") int userId, @Param("prefix") String prefix, Pageable pageable);

    long countByUserId(int userId);
}
