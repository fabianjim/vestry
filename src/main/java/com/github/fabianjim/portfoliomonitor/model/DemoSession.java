package com.github.fabianjim.portfoliomonitor.model;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

public class DemoSession implements Serializable {

    private static final long serialVersionUID = 1L;

    private Portfolio portfolio;
    private List<Transaction> transactions = new ArrayList<>();
    private List<JournalEntry> journalEntries = new ArrayList<>();
    private List<WatchlistItem> watchlistItems = new ArrayList<>();
    private int remainingTrades = 3;
    private int nextId = -1;

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
