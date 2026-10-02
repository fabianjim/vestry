package me.vestry.model;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Single database lock shared by all instances; absence prevents spending. */
@Entity
@Table(name = "ai_budget")
public class AiBudget {
    @Id
    private int id = 1;
    private boolean blocked;

    public boolean isBlocked() { return blocked; }
    public void block() { blocked = true; }
}
