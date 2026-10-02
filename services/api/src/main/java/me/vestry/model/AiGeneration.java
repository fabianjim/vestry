package me.vestry.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "ai_generations")
@Getter
@NoArgsConstructor
public class AiGeneration {
    public enum Status { RUNNING, SUCCEEDED, FAILED, UNKNOWN }
    @Id
    private UUID id;
    @Column(nullable = false, unique = true, length = 64)
    private String requestKey;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;
    @Column(nullable = false)
    private Instant startedAt;
    @Column(nullable = false)
    private LocalDate budgetDay;
    private long reservedMicros;
    private long chargedMicros;

    public AiGeneration(String requestKey, Instant now, LocalDate day, long allowance) {
        id = UUID.randomUUID();
        this.requestKey = requestKey;
        startedAt = now;
        budgetDay = day;
        reservedMicros = allowance;
        chargedMicros = allowance;
        status = Status.RUNNING;
    }

    public void finish(Status status, long charge) {
        this.status = status;
        chargedMicros = charge;
    }
}
