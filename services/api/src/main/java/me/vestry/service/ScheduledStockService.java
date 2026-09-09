package me.vestry.service;

import me.vestry.api.BatchStockResult;
import me.vestry.api.MarketDataClient;
import me.vestry.event.PriceFetchCompletedEvent;
import me.vestry.model.Stock;
import me.vestry.model.Stock.StockType;
import me.vestry.repository.TrackedStockRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClientResponseException;

import java.time.Instant;
import java.util.List;
import java.util.logging.Logger;

@Service
@EnableScheduling
public class ScheduledStockService {

    private static final Logger logger = Logger.getLogger(ScheduledStockService.class.getName());

    private final MarketScheduleService marketSchedule;
    private final StockService stockService;
    private final MarketDataClient marketDataClient;
    private final TrackedStockRepository trackedStockRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final TransactionTemplate transactionTemplate;
    private final int batchSize;

    public ScheduledStockService(StockService stockService, TrackedStockRepository trackedStockRepository,
                                 ApplicationEventPublisher eventPublisher, MarketScheduleService marketSchedule,
                                 MarketDataClient marketDataClient, PlatformTransactionManager transactionManager,
                                 @Value("${vestry.market.batch-size:100}") int batchSize) {
        if (batchSize < 1) throw new IllegalArgumentException("vestry.market.batch-size must be positive");
        this.marketSchedule = marketSchedule;
        this.stockService = stockService;
        this.marketDataClient = marketDataClient;
        this.trackedStockRepository = trackedStockRepository;
        this.eventPublisher = eventPublisher;
        this.batchSize = batchSize;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.transactionTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /**
     * Fetches intraday stock data every hour during market hours (10 AM - 4 PM New York time).
     * Fetches ALL tracked stocks once, shared across all users.
     */
    @Scheduled(cron = MarketScheduleService.INTRADAY_CRON, zone = "America/New_York")
    public void fetchIntradayStocks() {
        runScheduledFetch(StockType.INTRADAY);
    }

    /**
     * Fetches End of Day (EOD) stock data at 4:30 PM New York time.
     * Fetches ALL tracked stocks once, shared across all users.
     */
    @Scheduled(cron = MarketScheduleService.EOD_CRON, zone = "America/New_York")
    public void fetchEODStocks() {
        runScheduledFetch(StockType.EOD);
    }

    private void runScheduledFetch(StockType type) {
        if (!marketSchedule.isTradingDayToday()) return;
        try {
            List<String> tickers = trackedStockRepository.findAllActiveTickers().stream().distinct().toList();
            if (tickers.isEmpty()) {
                logger.info("Scheduled price batch type=" + type + " has no active tickers");
                return;
            }
            int attempted = 0;
            int successful = 0;
            int requests = 0;
            long started = System.nanoTime();
            for (int offset = 0; offset < tickers.size(); offset += batchSize) {
                List<String> chunk = tickers.subList(offset, Math.min(offset + batchSize, tickers.size()));
                Instant attemptedAt = Instant.now();
                attempted += chunk.size();
                BatchStockResult result;
                try {
                    // No database transaction spans network I/O. No retry or individual fallback.
                    result = marketDataClient.getStockDataBatch(chunk, type);
                } catch (Exception e) {
                    requests++; // The adapter throws for a failed HTTP request or response.
                    String reason = e instanceof RestClientResponseException http
                            ? "HTTP " + http.getStatusCode().value() : e.getClass().getSimpleName();
                    logger.severe("Scheduled price batch type=" + type + " request=" + requests
                            + " failed: " + reason + "; remaining chunks skipped");
                    for (String ticker : chunk) recordFailedAttempt(ticker, attemptedAt);
                    break;
                }
                if (result.requestAttempted()) requests++;
                successful += persistBatchResults(chunk, result, attemptedAt);
            }
            logger.info("Scheduled price batch type=" + type + " tickers=" + tickers.size()
                    + " requests=" + requests + " attempted=" + attempted + " successful=" + successful
                    + " failed=" + (attempted - successful) + " skipped=" + (tickers.size() - attempted)
                    + " durationMs=" + (System.nanoTime() - started) / 1_000_000);
            // Preserve the existing event payload (snapshot ticker count), after all commits/rollbacks.
            eventPublisher.publishEvent(new PriceFetchCompletedEvent(Instant.now(), tickers.size(), type == StockType.EOD));
        } catch (Exception e) {
            logger.severe("Scheduled price batch type=" + type + " could not complete: " + e.getClass().getSimpleName());
        }
    }

    private int persistBatchResults(List<String> tickers, BatchStockResult result, Instant attemptedAt) {
        int successful = 0;
        for (String ticker : tickers) {
            Stock stock = result.stocks().get(ticker);
            if (stock == null) {
                logger.warning("Scheduled price batch ticker=" + ticker + " failed: "
                        + result.failures().getOrDefault(ticker, "No observation returned"));
                recordFailedAttempt(ticker, attemptedAt);
                continue;
            }
            try {
                transactionTemplate.executeWithoutResult(status -> {
                    stockService.saveFetchedStock(stock);
                    trackedStockRepository.markFetchSuccessful(ticker, attemptedAt);
                });
                // Includes reused observations. Count success only after commit completes.
                successful++;
            } catch (Exception e) {
                logger.severe("Scheduled price batch ticker=" + ticker
                        + " persistence failed: " + e.getClass().getSimpleName());
                recordFailedAttempt(ticker, attemptedAt);
            }
        }
        return successful;
    }

    private void recordFailedAttempt(String ticker, Instant attemptedAt) {
        try {
            transactionTemplate.executeWithoutResult(status ->
                    trackedStockRepository.markFetchAttempt(ticker, attemptedAt));
        } catch (Exception e) {
            // A database outage can prevent even failure accounting; continue without claiming it was saved.
            logger.severe("Scheduled price batch ticker=" + ticker
                    + " could not record failed attempt: " + e.getClass().getSimpleName());
        }
    }
}
