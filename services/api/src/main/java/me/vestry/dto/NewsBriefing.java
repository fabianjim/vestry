package me.vestry.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Public news context only; never contains a user's journal or position sizes. */
public record NewsBriefing(LocalDate newsDate, Instant fetchedAt, Status status, List<Item> items) {
    public enum Status { FETCHING, READY, EMPTY, UNAVAILABLE, DISABLED }
    public record Item(String headline, String summary, LocalDate publishedOn, String url) {}

    public NewsBriefing {
        items = List.copyOf(items);
    }
}
