package com.github.fabianjim.portfoliomonitor.dto;

import java.time.Instant;

public class PortfolioHistoryDTO {
    private Instant timestamp;
    private double portfolioValue;
    private boolean isMarker = false;
    private String markerType;
    private Integer journalEntryId;

    public PortfolioHistoryDTO() {}

    public PortfolioHistoryDTO(Instant timestamp, double portfolioValue) {
        this.timestamp = timestamp;
        this.portfolioValue = portfolioValue;
    }

    public PortfolioHistoryDTO(Instant timestamp, double portfolioValue, boolean isMarker, String markerType, Integer journalEntryId) {
        this.timestamp = timestamp;
        this.portfolioValue = portfolioValue;
        this.isMarker = isMarker;
        this.markerType = markerType;
        this.journalEntryId = journalEntryId;
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

    public boolean isMarker() {
        return isMarker;
    }

    public void setMarker(boolean marker) {
        isMarker = marker;
    }

    public String getMarkerType() {
        return markerType;
    }

    public void setMarkerType(String markerType) {
        this.markerType = markerType;
    }

    public Integer getJournalEntryId() {
        return journalEntryId;
    }

    public void setJournalEntryId(Integer journalEntryId) {
        this.journalEntryId = journalEntryId;
    }
}
