package com.github.fabianjim.portfoliomonitor.dto;

import java.time.Instant;

public class PortfolioHistoryDTO {
    private Instant timestamp;
    private double portfolioValue;

    public PortfolioHistoryDTO() {}

    public PortfolioHistoryDTO(Instant timestamp, double portfolioValue) {
        this.timestamp = timestamp;
        this.portfolioValue = portfolioValue;
    }

    public Instant getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(Instant timestamp) {
        this.timestamp = timestamp;
    }

    public double getPortfolioValue() {
        return portfolioValue;
    }

    public void setPortfolioValue(double portfolioValue) {
        this.portfolioValue = portfolioValue;
    }
}
