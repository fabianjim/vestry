package com.github.fabianjim.portfoliomonitor.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

import com.fasterxml.jackson.annotation.JsonIgnore;

@Entity
@Table(name = "journal_entries")
public class JournalEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private int id;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private JournalEntryType entryType;

    @Column(nullable = false, length = 2000)
    private String body;

    @Column(nullable = true)
    private String ticker;

    @Column(nullable = false)
    private Instant timestamp;

    @Column(nullable = true)
    private Double priceSnapshot;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    @JsonIgnore
    private User user;

    @ManyToMany(fetch = FetchType.EAGER)
    @JoinTable(
        name = "journal_entry_tags",
        joinColumns = @JoinColumn(name = "journal_entry_id"),
        inverseJoinColumns = @JoinColumn(name = "tag_id")
    )
    private Set<Tag> tags = new HashSet<>();

    public JournalEntry() {}

    public int getId() {
        return id;
    }

    public void setId(int id) {
        this.id = id;
    }

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

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public Set<Tag> getTags() {
        return tags;
    }

    public void setTags(Set<Tag> tags) {
        this.tags = tags;
    }
}
