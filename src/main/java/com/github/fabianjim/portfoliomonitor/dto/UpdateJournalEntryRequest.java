package com.github.fabianjim.portfoliomonitor.dto;

import java.util.List;

public class UpdateJournalEntryRequest {

    private String body;
    private List<String> tags;

    public String getBody() {
        return body;
    }

    public void setBody(String body) {
        this.body = body;
    }

    public List<String> getTags() {
        return tags;
    }

    public void setTags(List<String> tags) {
        this.tags = tags;
    }
}
