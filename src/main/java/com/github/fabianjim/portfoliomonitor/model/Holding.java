package com.github.fabianjim.portfoliomonitor.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "holdings", uniqueConstraints = @UniqueConstraint(columnNames = {"portfolio_id", "ticker"}))
public class Holding {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private int id;

    @Column(nullable = false)
    private String ticker;

    @Column(nullable = false)
    private double shares;

    @Column(nullable = false)
    private Instant buyTimestamp;

    @Transient
    private StockMetadata metadata;

    public Holding() {}

    public Holding(String ticker, double shares) {
        this.ticker = ticker;
        this.shares = shares;
        this.buyTimestamp = Instant.now();
    }

    @PrePersist
    public void prePersist() {
        if (this.buyTimestamp == null) {
            this.buyTimestamp = Instant.now();
        }
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

    public double getShares() {
        return shares;
    }

    public void setShares(double shares) {
        this.shares = shares;
    }

    public Instant getBuyTimestamp() {
        return buyTimestamp;
    }

    public void setBuyTimestamp(Instant buyTimestamp) {
        this.buyTimestamp = buyTimestamp;
    }

    public StockMetadata getMetadata() {
        return metadata;
    }

    public void setMetadata(StockMetadata metadata) {
        this.metadata = metadata;
    }
}