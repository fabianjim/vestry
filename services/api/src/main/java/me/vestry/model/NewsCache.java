package me.vestry.model;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import me.vestry.dto.NewsBriefing.Status;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "news_cache")
@Getter
@NoArgsConstructor
public class NewsCache {
    @Id
    @Column(length = 64)
    private String id;
    // A null version makes the initial save an INSERT, so concurrent claims cannot overwrite each other.
    @Version
    private Long version;
    private LocalDate newsDate;
    private Instant fetchedAt;
    @Enumerated(EnumType.STRING)
    private Status status;
    @JdbcTypeCode(SqlTypes.JSON)
    private JsonNode items;

    public NewsCache(String key, LocalDate day, Instant now) {
        id = key;
        newsDate = day;
        fetchedAt = now;
        status = Status.FETCHING;
    }

    public void complete(Status status, JsonNode items, Instant now) {
        this.status = status;
        this.items = items;
        fetchedAt = now;
    }
}
