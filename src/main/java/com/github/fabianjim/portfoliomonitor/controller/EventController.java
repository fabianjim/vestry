package com.github.fabianjim.portfoliomonitor.controller;

import com.github.fabianjim.portfoliomonitor.event.PriceFetchEventService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/events")
public class EventController {

    private final PriceFetchEventService priceFetchEventService;

    public EventController(PriceFetchEventService priceFetchEventService) {
        this.priceFetchEventService = priceFetchEventService;
    }

    @GetMapping
    public SseEmitter subscribe() {
        return priceFetchEventService.subscribe();
    }
}
