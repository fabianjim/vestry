package me.vestry.controller;

import me.vestry.dto.StockDataDTO;
import me.vestry.model.DemoSession;
import me.vestry.model.Portfolio;
import me.vestry.model.Stock;
import me.vestry.model.Stock.StockType;
import me.vestry.model.TrackedStock;
import me.vestry.repository.TrackedStockRepository;
import me.vestry.service.DemoSessionResolver;
import me.vestry.service.DemoSessionService;
import me.vestry.service.PortfolioService;
import me.vestry.service.StockService;
import me.vestry.service.MarketScheduleService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/stock")
public class StockController {

    private final MarketScheduleService marketSchedule;
    private final StockService stockService;
    private final PortfolioService portfolioService;
    private final TrackedStockRepository trackedStockRepository;
    private final DemoSessionResolver demoSessionResolver;
    private final DemoSessionService demoSessionService;

    public StockController(StockService stockService, PortfolioService portfolioService,
                          TrackedStockRepository trackedStockRepository,
                          DemoSessionResolver demoSessionResolver,
                          DemoSessionService demoSessionService, MarketScheduleService marketSchedule) {
        this.marketSchedule = marketSchedule;
        this.stockService = stockService;
        this.portfolioService = portfolioService;
        this.trackedStockRepository = trackedStockRepository;
        this.demoSessionResolver = demoSessionResolver;
        this.demoSessionService = demoSessionService;
    }

    // initial manual fetch from the frontend before routine fetches
    @GetMapping("/fetch/initial")
    public List<Stock> fectchInitialStocks(HttpServletRequest request) {
        if (demoSessionResolver.isDemoUser()) {
            DemoSession session = demoSessionResolver.resolveSession(request);
            List<String> tickers = demoSessionService.getTickersFromPortfolio(session);
            return stockService.updateMultipleStocks(tickers, StockType.INITIAL);
        }
        Portfolio portfolio = portfolioService.getPortfolio();
        List<String> tickers = portfolioService.getTickersfromPortfolio(portfolio);
        return stockService.updateMultipleStocks(tickers, StockType.INITIAL);
    }

    // Get latest stock data with stale warning
    @GetMapping("/data/{ticker}")
    public StockDataDTO getStockData(@PathVariable String ticker) {
        Optional<Stock> stockOpt = stockService.getLatestStockData(ticker);
        Optional<TrackedStock> trackedOpt = trackedStockRepository.findByTicker(ticker);

        if (stockOpt.isEmpty()) {
            return new StockDataDTO(null, true, "No data available for this stock", null);
        }

        Stock stock = stockOpt.get();

        if (trackedOpt.isPresent()) {
            TrackedStock tracked = trackedOpt.get();
            boolean isEod = isEodData(stock);
            boolean isStale = !isEod && tracked.isStale();
            String warning = isStale ? "Data is stale" : null;
            return new StockDataDTO(stock, isStale, warning, tracked.getLastSuccessfulFetch(), isEod);
        }

        // If not tracked but has data, it's likely orphaned data
        return new StockDataDTO(stock, true, "Stock is not currently being tracked", null, false);
    }

    public record UpdateSchedule(Instant nextUpdate) {}

    @GetMapping("/schedule")
    public UpdateSchedule getUpdateSchedule() {
        return new UpdateSchedule(marketSchedule.nextUpdate(Instant.now()));
    }

    private boolean isEodData(Stock stock) {
        return isEodData(stock, ZonedDateTime.now(MarketScheduleService.MARKET_ZONE));
    }

    // Only the latest trading session's EOD is valid through closures and pre-market.
    boolean isEodData(Stock stock, ZonedDateTime now) {
        if (stock.getType() != Stock.StockType.EOD || stock.getHourBucket() == null) return false;
        return marketSchedule.isCurrentEod(
                stock.getHourBucket().atZone(MarketScheduleService.MARKET_ZONE).toLocalDate(), now.toInstant());
    }

    // Get historical data for a ticker from a specific timestamp
    @GetMapping("/history/{ticker}")
    public List<Stock> getHistoricalData(@PathVariable String ticker, @RequestParam(required = false) Instant from) {
        List<Stock> allData = stockService.getHistoricalStockData(ticker);

        if (from != null) {
            // Filter data from the specified timestamp onwards
            return allData.stream()
                .filter(s -> !s.getTimestamp().isBefore(from))
                .toList();
        }

        return allData;
    }

}
