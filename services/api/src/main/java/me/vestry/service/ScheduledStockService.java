package me.vestry.service;

import me.vestry.event.PriceFetchCompletedEvent;
import me.vestry.model.Stock;
import me.vestry.model.Stock.StockType;
import me.vestry.model.TrackedStock;
import me.vestry.repository.TrackedStockRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.logging.Logger;

@Service
@Transactional
@EnableScheduling
public class ScheduledStockService {

    private static final Logger logger = Logger.getLogger(ScheduledStockService.class.getName());

    private final MarketScheduleService marketSchedule;
    private final StockService stockService;
    private final TrackedStockRepository trackedStockRepository;
    private final ApplicationEventPublisher eventPublisher;

    public ScheduledStockService(StockService stockService, TrackedStockRepository trackedStockRepository,
                                 ApplicationEventPublisher eventPublisher, MarketScheduleService marketSchedule) {
        this.marketSchedule = marketSchedule;
        this.stockService = stockService;
        this.trackedStockRepository = trackedStockRepository;
        this.eventPublisher = eventPublisher;
    }

    /**
     * Fetches intraday stock data every hour during market hours (10 AM - 4 PM EST)
     * Fetches ALL tracked stocks once, shared across all users
     */
    @Scheduled(cron = MarketScheduleService.INTRADAY_CRON, zone = "America/New_York")
    public void fetchIntradayStocks() {
        if (!marketSchedule.isTradingDayToday()) return;
        try {
            logger.info("Starting scheduled intraday stock fetch for all tracked stocks...");

            List<String> tickers = trackedStockRepository.findAllActiveTickers();

            if (tickers.isEmpty()) {
                logger.info("No active stocks to fetch");
                return;
            }

            logger.info("Fetching data for " + tickers.size() + " tracked stocks");

            for (String ticker : tickers) {
                try {
                    updateTrackedStock(ticker, StockType.INTRADAY);
                } catch (Exception e) {
                    logger.severe("Failed to update " + ticker + ": " + e.getMessage());
                    updateTrackedStockError(ticker, e.getMessage());
                }
            }

            logger.info("Completed intraday fetch for " + tickers.size() + " stocks");
            eventPublisher.publishEvent(new PriceFetchCompletedEvent(Instant.now(), tickers.size(), false));

        } catch (Exception e) {
            logger.severe("Error during scheduled intraday stock fetch: " + e.getMessage());
        }
    }

    /**
     * Fetches End of Day (EOD) stock data at 4:30 PM EST
     * Fetches ALL tracked stocks once, shared across all users
     */
    @Scheduled(cron = MarketScheduleService.EOD_CRON, zone = "America/New_York")
    public void fetchEODStocks() {
        if (!marketSchedule.isTradingDayToday()) return;
        try {
            logger.info("Starting scheduled EOD stock fetch for all tracked stocks...");

            List<String> tickers = trackedStockRepository.findAllActiveTickers();

            if (tickers.isEmpty()) {
                logger.info("No active stocks to fetch");
                return;
            }

            logger.info("Fetching EOD data for " + tickers.size() + " tracked stocks");

            for (String ticker : tickers) {
                try {
                    updateTrackedStock(ticker, StockType.EOD);
                } catch (Exception e) {
                    logger.severe("Failed to update " + ticker + ": " + e.getMessage());
                    updateTrackedStockError(ticker, e.getMessage());
                }
            }

            logger.info("Completed EOD fetch for " + tickers.size() + " stocks");
            eventPublisher.publishEvent(new PriceFetchCompletedEvent(Instant.now(), tickers.size(), true));

        } catch (Exception e) {
            logger.severe("Error during scheduled EOD stock fetch: " + e.getMessage());
        }
    }

    private void updateTrackedStock(String ticker, StockType type) {
        Stock updatedStock = stockService.updateStockData(ticker, type);

        TrackedStock trackedStock = trackedStockRepository.findByTicker(ticker)
            .orElse(null);

        if (trackedStock != null) {
            trackedStock.setLastFetchAttempt(Instant.now());
            trackedStock.setLastSuccessfulFetch(Instant.now());
            trackedStockRepository.save(trackedStock);
        }
    }

    private void updateTrackedStockError(String ticker, String errorMessage) {
        TrackedStock trackedStock = trackedStockRepository.findByTicker(ticker)
            .orElse(null);

        if (trackedStock != null) {
            trackedStock.setLastFetchAttempt(Instant.now());
            trackedStockRepository.save(trackedStock);
        }
    }
}