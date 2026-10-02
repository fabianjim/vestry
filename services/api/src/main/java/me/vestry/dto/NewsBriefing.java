package me.vestry.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Public news context only; never contains a user's journal or position sizes. */
public record NewsBriefing(LocalDate newsDate, Instant fetchedAt, Status status, List<Item> items, String research) {
    public enum Status { FETCHING, READY, EMPTY, UNAVAILABLE, DISABLED }
    // Retain article fields for previously saved briefings; search sources may omit dates and summaries.
    public record Item(String headline, String summary, LocalDate publishedOn, String url) {}

    public NewsBriefing(LocalDate newsDate, Instant fetchedAt, Status status, List<Item> items) {
        this(newsDate, fetchedAt, status, items, "");
    }

    public NewsBriefing {
        items = List.copyOf(items);
    }
}
