package me.vestry.repository;

import me.vestry.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.List;

@Repository
public interface UserRepository extends JpaRepository<User, Integer> {
    
    List<User> findByDemoTrue();

    Optional<User> findByUsername(String username);
    
    boolean existsByUsername(String username);
}
