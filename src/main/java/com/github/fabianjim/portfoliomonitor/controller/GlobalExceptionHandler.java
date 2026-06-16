package com.github.fabianjim.portfoliomonitor.controller;

import com.github.fabianjim.portfoliomonitor.exception.DemoTradeLimitExceededException;
import com.github.fabianjim.portfoliomonitor.exception.PriceFetchException;
import com.github.fabianjim.portfoliomonitor.exception.UnknownTickerException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;

import java.util.Map;

@ControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(UnknownTickerException.class)
    public ResponseEntity<Map<String, String>> handleUnknownTicker(UnknownTickerException e) {
        return ResponseEntity
                .status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", e.getMessage()));
    }

    @ExceptionHandler(PriceFetchException.class)
    public ResponseEntity<Map<String, String>> handlePriceFetch(PriceFetchException e) {
        return ResponseEntity
                .status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("error", e.getMessage()));
    }

    @ExceptionHandler(DemoTradeLimitExceededException.class)
    public ResponseEntity<Map<String, String>> handleDemoTradeLimit(DemoTradeLimitExceededException e) {
        return ResponseEntity
                .status(HttpStatus.FORBIDDEN)
                .body(Map.of("error", e.getMessage(), "demoTradeLimitReached", "true"));
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<Map<String, String>> handleRuntime(RuntimeException e) {
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(Map.of("error", e.getMessage()));
    }
}
