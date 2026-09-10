package me.vestry.service;

import me.vestry.model.TrackedStock;
import me.vestry.repository.TrackedStockRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Shared fetching demand; callers register once per holding and release on full removal. */
@Service
@Transactional
public class TrackedStockService {
    private static final Logger logger = LoggerFactory.getLogger(TrackedStockService.class);

    private final TrackedStockRepository trackedStockRepository;

    public TrackedStockService(TrackedStockRepository trackedStockRepository) {
        this.trackedStockRepository = trackedStockRepository;
    }

    // Join the caller's transaction so a failed real trade also rolls back its demand.
    public void registerHolding(String ticker) {
        TrackedStock trackedStock = trackedStockRepository.findByTicker(ticker).orElse(null);
        if (trackedStock == null) {
            trackedStock = new TrackedStock(ticker);
        } else {
            trackedStock.incrementHolderCount();
        }
        trackedStockRepository.save(trackedStock);
        logger.info("Registered holding demand for ticker={} count={}", ticker, trackedStock.getHolderCount());
    }

    public void releaseHolding(String ticker) {
        TrackedStock trackedStock = trackedStockRepository.findByTicker(ticker).orElse(null);
        if (trackedStock == null) {
            logger.warn("Could not find tracked stock to release for ticker={}", ticker);
            return;
        }

        trackedStock.decrementHolderCount();
        if (trackedStock.getHolderCount() <= 0) {
            trackedStockRepository.delete(trackedStock);
            logger.info("Removed tracking for ticker={} with no remaining holders", ticker);
        } else {
            trackedStockRepository.save(trackedStock);
            logger.info("Released holding demand for ticker={} count={}", ticker, trackedStock.getHolderCount());
        }
    }
}
