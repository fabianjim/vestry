package com.github.fabianjim.portfoliomonitor.dto;

import com.github.fabianjim.portfoliomonitor.model.JournalEntryType;

import java.time.Instant;
import java.util.List;

public class CreateJournalEntryRequest {

    private JournalEntryType entryType;
    private String body;
    private String ticker;
    private Instant timestamp;
    private Double priceSnapshot;
    private List<String> tags;

    public JournalEntryType getEntryType() {
        return entryType;
    }

    public void setEntryType(JournalEntryType entryType) {
        this.entryType = entryType;
    }

    public String getBody() {
        return body;
    }

    public void setBody(String body) {
        this.body = body;
    }

    public String getTicker() {
        return ticker;
    }

    public void setTicker(String ticker) {
        this.ticker = ticker;
    }

    public Instant getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(Instant timestamp) {
        this.timestamp = timestamp;
    }

    public Double getPriceSnapshot() {
        return priceSnapshot;
    }

    public void setPriceSnapshot(Double priceSnapshot) {
        this.priceSnapshot = priceSnapshot;
    }

    public List<String> getTags() {
        return tags;
    }

    public void setTags(List<String> tags) {
        this.tags = tags;
    }
}
