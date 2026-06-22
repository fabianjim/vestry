package com.github.fabianjim.portfoliomonitor.model;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class DemoSession implements Serializable {

    private static final long serialVersionUID = 1L;

    private Portfolio portfolio;
    private List<Transaction> transactions = new ArrayList<>();
    private List<JournalEntry> journalEntries = new ArrayList<>();
    private List<WatchlistItem> watchlistItems = new ArrayList<>();
    private int remainingTrades = 3;
    private int nextId = -1;
    private Set<String> sessionTrackedTickers = new HashSet<>();

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

    public int nextId() {
        return nextId--;
    }
}
