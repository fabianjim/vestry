package me.vestry.model;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "portfolio_digests", indexes = @Index(columnList = "user_id,generated_at"))
@Getter
@NoArgsConstructor
public class PortfolioDigest {
    @Id
    private UUID id;
    @Version
    private Long version;
    @Column(name = "user_id", nullable = false)
    private int userId;
    private Instant capturedAt;
    @Column(name = "generated_at", nullable = false)
    private Instant generatedAt;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private JsonNode content;

    public PortfolioDigest(UUID job, int userId, Instant capturedAt, Instant generatedAt, JsonNode content) {
        id = job;
        this.userId = userId;
        this.capturedAt = capturedAt;
        this.generatedAt = generatedAt;
        this.content = content;
    }
}
