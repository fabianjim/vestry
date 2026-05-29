package com.github.fabianjim.portfoliomonitor.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "tracked_stocks")
public class TrackedStock {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private int id;
    
    @Column(nullable = false, unique = true)
    private String ticker;
    
    @Column(nullable = false)
    private Instant firstTrackedAt;
    
    @Column(nullable = false)
    private int holderCount;
    
    @Column(nullable = true)
    private Instant lastFetchAttempt;
    
    @Column(nullable = true)
    private Instant lastSuccessfulFetch;
    
    public TrackedStock() {}
    
    public TrackedStock(String ticker) {
        this.ticker = ticker;
        this.firstTrackedAt = Instant.now();
        this.holderCount = 1;
    }
    
    public int getId() {
        return id;
    }
    
    public void setId(int id) {
        this.id = id;
    }
    
    public String getTicker() {
        return ticker;
    }
    
    public void setTicker(String ticker) {
        this.ticker = ticker;
    }
    
    public Instant getFirstTrackedAt() {
        return firstTrackedAt;
    }
    
    public void setFirstTrackedAt(Instant firstTrackedAt) {
        this.firstTrackedAt = firstTrackedAt;
    }
    
    public int getHolderCount() {
        return holderCount;
    }
    
    public void setHolderCount(int holderCount) {
        this.holderCount = holderCount;
    }
    
    public void incrementHolderCount() {
        this.holderCount++;
    }
    
    public void decrementHolderCount() {
        this.holderCount--;
    }
    
    public Instant getLastFetchAttempt() {
        return lastFetchAttempt;
    }
    
    public void setLastFetchAttempt(Instant lastFetchAttempt) {
        this.lastFetchAttempt = lastFetchAttempt;
    }
    
    public Instant getLastSuccessfulFetch() {
        return lastSuccessfulFetch;
    }
    
    public void setLastSuccessfulFetch(Instant lastSuccessfulFetch) {
        this.lastSuccessfulFetch = lastSuccessfulFetch;
    }
    
    public boolean isStale() {
        if (lastSuccessfulFetch == null) {
            return true;
        }
        // Data is stale if older than 2 hours
        return lastSuccessfulFetch.isBefore(Instant.now().minusSeconds(7200));
    }
}
