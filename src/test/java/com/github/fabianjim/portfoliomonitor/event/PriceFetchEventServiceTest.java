package com.github.fabianjim.portfoliomonitor.event;

import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.lang.reflect.Field;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class PriceFetchEventServiceTest {

    private final PriceFetchEventService priceFetchEventService = new PriceFetchEventService();

    @Test
    void subscribeReturnsEmitter() {
        SseEmitter emitter = priceFetchEventService.subscribe();
        assertNotNull(emitter);
    }

    @Test
    @SuppressWarnings("unchecked")
    void eventIsBroadcastToSubscribers() throws Exception {
        AtomicInteger sendCount = new AtomicInteger(0);
        SseEmitter countingEmitter = new SseEmitter(30_000L) {
            @Override
            public void send(SseEventBuilder builder) throws IOException {
                sendCount.incrementAndGet();
                super.send(builder);
            }
        };

        Field emittersField = PriceFetchEventService.class.getDeclaredField("emitters");
        emittersField.setAccessible(true);
        List<SseEmitter> emitters = (List<SseEmitter>) emittersField.get(priceFetchEventService);
        emitters.add(countingEmitter);

        priceFetchEventService.handlePriceFetchCompleted(
            new PriceFetchCompletedEvent(Instant.now(), 2, false));

        assertEquals(1, sendCount.get());
    }

    @Test
    void payloadExposesExpectedFields() {
        PriceFetchEventService.PriceFetchCompletedPayload payload =
            new PriceFetchEventService.PriceFetchCompletedPayload("2026-06-16T12:00:00Z", 3, true);

        assertEquals("2026-06-16T12:00:00Z", payload.getTimestamp());
        assertEquals(3, payload.getTickerCount());
        assertTrue(payload.isEod());
    }
}
