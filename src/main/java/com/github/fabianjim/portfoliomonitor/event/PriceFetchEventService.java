package com.github.fabianjim.portfoliomonitor.event;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.logging.Logger;

@Service
public class PriceFetchEventService {

    private static final Logger logger = Logger.getLogger(PriceFetchEventService.class.getName());
    private static final long SSE_TIMEOUT = 30 * 60 * 1000L;

    private final List<SseEmitter> emitters = new ArrayList<>();

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT);
        synchronized (emitters) {
            emitters.add(emitter);
        }

        emitter.onCompletion(() -> removeEmitter(emitter));
        emitter.onTimeout(() -> removeEmitter(emitter));
        emitter.onError((e) -> removeEmitter(emitter));

        try {
            emitter.send(SseEmitter.event().name("connected").data("ok"));
        } catch (IOException e) {
            logger.warning("Failed to send SSE connected event: " + e.getMessage());
            emitter.completeWithError(e);
        }

        return emitter;
    }

    @EventListener
    public void handlePriceFetchCompleted(PriceFetchCompletedEvent event) {
        synchronized (emitters) {
            List<SseEmitter> deadEmitters = new ArrayList<>();
            for (SseEmitter emitter : emitters) {
                try {
                    emitter.send(SseEmitter.event()
                        .name("priceFetchCompleted")
                        .data(new PriceFetchCompletedPayload(event.getTimestamp().toString(), event.getTickerCount(), event.isEod())));
                } catch (IOException e) {
                    deadEmitters.add(emitter);
                }
            }
            emitters.removeAll(deadEmitters);
        }
    }

    private void removeEmitter(SseEmitter emitter) {
        synchronized (emitters) {
            emitters.remove(emitter);
        }
    }

    public static class PriceFetchCompletedPayload {
        private final String timestamp;
        private final int tickerCount;
        private final boolean eod;

        public PriceFetchCompletedPayload(String timestamp, int tickerCount, boolean eod) {
            this.timestamp = timestamp;
            this.tickerCount = tickerCount;
            this.eod = eod;
        }

        public String getTimestamp() {
            return timestamp;
        }

        public int getTickerCount() {
            return tickerCount;
        }

        public boolean isEod() {
            return eod;
        }
    }
}
