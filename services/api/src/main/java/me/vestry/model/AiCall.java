package me.vestry.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.util.UUID;

@Entity
@Table(name = "ai_calls", uniqueConstraints = @UniqueConstraint(columnNames = {"generation_id", "step"}))
@Getter
@NoArgsConstructor
public class AiCall {
    @Id
    private UUID id;
    @Column(name = "generation_id", nullable = false)
    private UUID generationId;
    @Column(nullable = false, length = 80)
    private String step;
    private long reservedMicros;
    private long chargedMicros;
    private boolean settled;

    public AiCall(UUID generationId, String step, long allowance) {
        id = UUID.randomUUID();
        this.generationId = generationId;
        this.step = step;
        reservedMicros = allowance;
        chargedMicros = allowance;
    }

    public void settle(long charge) {
        chargedMicros = charge;
        settled = true;
    }
}
