package me.vestry.repository;

import me.vestry.model.NewsCache;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NewsCacheRepository extends JpaRepository<NewsCache, String> {}
