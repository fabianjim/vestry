package com.github.fabianjim.portfoliomonitor.dto;

public class PnLSummaryDTO {
    private double totalPnL;
    private double totalPnLPercent;
    private double unrealizedPnL;
    private double unrealizedPnLPercent;
    private double realizedPnL;
    private double realizedPnLPercent;

    public PnLSummaryDTO() {}

    public PnLSummaryDTO(double totalPnL, double totalPnLPercent,
                         double unrealizedPnL, double unrealizedPnLPercent,
                         double realizedPnL, double realizedPnLPercent) {
        this.totalPnL = totalPnL;
        this.totalPnLPercent = totalPnLPercent;
        this.unrealizedPnL = unrealizedPnL;
        this.unrealizedPnLPercent = unrealizedPnLPercent;
        this.realizedPnL = realizedPnL;
        this.realizedPnLPercent = realizedPnLPercent;
    }

    public double getTotalPnL() {
        return totalPnL;
    }

    public void setTotalPnL(double totalPnL) {
        this.totalPnL = totalPnL;
    }

    public double getTotalPnLPercent() {
        return totalPnLPercent;
    }

    public void setTotalPnLPercent(double totalPnLPercent) {
        this.totalPnLPercent = totalPnLPercent;
    }

    public double getUnrealizedPnL() {
        return unrealizedPnL;
    }

    public void setUnrealizedPnL(double unrealizedPnL) {
        this.unrealizedPnL = unrealizedPnL;
    }

    public double getUnrealizedPnLPercent() {
        return unrealizedPnLPercent;
    }

    public void setUnrealizedPnLPercent(double unrealizedPnLPercent) {
        this.unrealizedPnLPercent = unrealizedPnLPercent;
    }

    public double getRealizedPnL() {
        return realizedPnL;
    }

    public void setRealizedPnL(double realizedPnL) {
        this.realizedPnL = realizedPnL;
    }

    public double getRealizedPnLPercent() {
        return realizedPnLPercent;
    }

    public void setRealizedPnLPercent(double realizedPnLPercent) {
        this.realizedPnLPercent = realizedPnLPercent;
    }
}
