package com.github.fabianjim.portfoliomonitor.exception;

public class PriceFetchException extends RuntimeException {
    private final String ticker;

    public PriceFetchException(String ticker, String message) {
        super(message != null ? message : "Unable to fetch price for " + ticker + " right now. Please try again later.");
        this.ticker = ticker;
    }

    public PriceFetchException(String ticker, String message, Throwable cause) {
        super(message != null ? message : "Unable to fetch price for " + ticker + " right now. Please try again later.", cause);
        this.ticker = ticker;
    }

    public String getTicker() {
        return ticker;
    }
}
