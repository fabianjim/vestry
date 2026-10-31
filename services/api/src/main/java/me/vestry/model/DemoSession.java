package me.vestry.model;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.Serializable;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class DemoSession implements Serializable {

    private static final long serialVersionUID = 1L;

    private Portfolio portfolio;
    private volatile JsonNode holdingsLayout;
    private volatile JsonNode dashboardLayout;
    private List<Transaction> transactions = new ArrayList<>();
    private List<JournalEntry> journalEntries = new ArrayList<>();
    private List<WatchlistItem> watchlistItems = new ArrayList<>();
    private int remainingTrades = 3;
    private int nextId = -1;
    private Set<String> sessionTrackedTickers = new HashSet<>();
    // copied entry id to the template entry it came from; entries the visitor writes have none
    private Map<Integer, Integer> templateEntryIds = new HashMap<>();
    // copied transaction id to the template transaction it came from; the visitor's own trades have none
    private Map<Integer, Integer> templateTransactionIds = new HashMap<>();
    // the visitor's reactions to the template's behaviors, never saved
    private Map<BehaviorKey, BehaviorFeedback> insightFeedback = new HashMap<>();

    public Map<BehaviorKey, BehaviorFeedback> getInsightFeedback() {
        return insightFeedback;
    }

    public JsonNode getHoldingsLayout() {
        return holdingsLayout;
    }

    public void setHoldingsLayout(JsonNode holdingsLayout) {
        this.holdingsLayout = holdingsLayout;
    }

    public JsonNode getDashboardLayout() {
        return dashboardLayout;
    }

    public void setDashboardLayout(JsonNode dashboardLayout) {
        this.dashboardLayout = dashboardLayout;
    }

    public Set<String> getSessionTrackedTickers() {
        return sessionTrackedTickers;
    }

    public void setSessionTrackedTickers(Set<String> sessionTrackedTickers) {
        this.sessionTrackedTickers = sessionTrackedTickers;
    }

    public Portfolio getPortfolio() {
        return portfolio;
    }

    public void setPortfolio(Portfolio portfolio) {
        this.portfolio = portfolio;
    }

    public List<Transaction> getTransactions() {
        return transactions;
    }

    public void setTransactions(List<Transaction> transactions) {
        this.transactions = transactions;
    }

    public List<JournalEntry> getJournalEntries() {
        return journalEntries;
    }

    public void setJournalEntries(List<JournalEntry> journalEntries) {
        this.journalEntries = journalEntries;
    }

    public List<WatchlistItem> getWatchlistItems() {
        return watchlistItems;
    }

    public void setWatchlistItems(List<WatchlistItem> watchlistItems) {
        this.watchlistItems = watchlistItems;
    }

    public int getRemainingTrades() {
        return remainingTrades;
    }

    public void setRemainingTrades(int remainingTrades) {
        this.remainingTrades = remainingTrades;
    }

    public Map<Integer, Integer> getTemplateEntryIds() {
        return templateEntryIds;
    }

    public void setTemplateEntryIds(Map<Integer, Integer> templateEntryIds) {
        this.templateEntryIds = templateEntryIds;
    }

    public Map<Integer, Integer> getTemplateTransactionIds() {
        return templateTransactionIds;
    }

    /** Template entry id to the visitor's copy, for AI output that cites the template's entries. */
    public Map<Integer, Integer> copyIdsByTemplateId() {
        return inverse(templateEntryIds);
    }

    /** Template transaction id to the visitor's copy, for behavior reports that list the template's trades. */
    public Map<Integer, Integer> copyTransactionIdsByTemplateId() {
        return inverse(templateTransactionIds);
    }

    private static Map<Integer, Integer> inverse(Map<Integer, Integer> copyToTemplate) {
        var copies = new HashMap<Integer, Integer>();
        copyToTemplate.forEach((copy, template) -> copies.put(template, copy));
        return copies;
    }

    public int nextId() {
        return nextId--;
    }
}
