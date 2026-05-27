package com.github.fabianjim.portfoliomonitor.exception;

public class UnknownTickerException extends RuntimeException {
    private final String ticker;

    public UnknownTickerException(String ticker) {
        super("Ticker '" + ticker + "' does not exist. Please check the symbol and try again.");
        this.ticker = ticker;
    }

    public String getTicker() {
        return ticker;
    }
}
