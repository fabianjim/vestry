package me.vestry.api;

import java.time.LocalDate;

/** One trading day's split- and dividend-adjusted close. */
public record DailyClose(LocalDate date, double adjClose) {}
