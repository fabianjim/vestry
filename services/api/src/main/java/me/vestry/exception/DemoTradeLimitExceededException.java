package me.vestry.exception;

public class DemoTradeLimitExceededException extends RuntimeException {

    public DemoTradeLimitExceededException() {
        super("Demo trade limit reached. You can make up to 3 buy/sell actions in demo mode.");
    }
}
