package com.github.fabianjim.portfoliomonitor.event;

import java.time.Instant;

public class PriceFetchCompletedEvent {

    private final Instant timestamp;
    private final int tickerCount;
    private final boolean eod;

    public PriceFetchCompletedEvent(Instant timestamp, int tickerCount, boolean eod) {
        this.timestamp = timestamp;
        this.tickerCount = tickerCount;
        this.eod = eod;
    }

    public Instant getTimestamp() {
        return timestamp;
    }

    public int getTickerCount() {
        return tickerCount;
    }

    public boolean isEod() {
        return eod;
    }
}
