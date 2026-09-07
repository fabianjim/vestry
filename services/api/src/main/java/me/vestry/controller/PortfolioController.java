package me.vestry.controller;

import me.vestry.dto.PnLSummaryDTO;
import me.vestry.dto.PortfolioHistoryDTO;
import me.vestry.model.DemoSession;
import me.vestry.model.Holding;
import me.vestry.model.JournalEntry;
import me.vestry.model.Portfolio;
import me.vestry.model.Transaction;
import me.vestry.model.User;

import me.vestry.service.DemoSessionResolver;
import me.vestry.service.DemoSessionService;
import me.vestry.service.NasdaqMetadataService;
import me.vestry.service.PortfolioService;
import me.vestry.service.TransactionService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/portfolio")
public class PortfolioController {

    private final PortfolioService portfolioService;
    private final TransactionService transactionService;
    private final NasdaqMetadataService nasdaqMetadataService;
    private final DemoSessionResolver demoSessionResolver;
    private final DemoSessionService demoSessionService;

    public PortfolioController(PortfolioService portfolioService, TransactionService transactionService,
                               NasdaqMetadataService nasdaqMetadataService,
                               DemoSessionResolver demoSessionResolver,
                               DemoSessionService demoSessionService) {
        this.portfolioService = portfolioService;
        this.transactionService = transactionService;
        this.nasdaqMetadataService = nasdaqMetadataService;
        this.demoSessionResolver = demoSessionResolver;
        this.demoSessionService = demoSessionService;
    }

    @PostMapping("/create")
    public void createPortfolio(@RequestBody Portfolio portfolio, HttpServletRequest request) {
        if (demoSessionResolver.isDemoUser()) {
            DemoSession session = demoSessionResolver.resolveSession(request);
            User user = demoSessionResolver.getCurrentUser();
            demoSessionService.createPortfolio(session, user, portfolio);
        } else {
            portfolioService.createPortfolio(portfolio);
        }
    }

    @GetMapping
    public Portfolio getPortfolio(HttpServletRequest request) {
        if (demoSessionResolver.isDemoUser()) {
            return demoSessionService.getPortfolio(demoSessionResolver.resolveSession(request));
        }
        return portfolioService.getPortfolio();
    }

    @GetMapping("/exists")
    public boolean exists(HttpServletRequest request) {
        if (demoSessionResolver.isDemoUser()) {
            return demoSessionService.existsByUserId(demoSessionResolver.resolveSession(request));
        }
        return portfolioService.existsByUserId();
    }

    @GetMapping("/holdings")
    public List<Holding> fetchHoldings(HttpServletRequest request) {
        List<Holding> holdings;
        if (demoSessionResolver.isDemoUser()) {
            Portfolio current = demoSessionService.getPortfolio(demoSessionResolver.resolveSession(request));
            holdings = current != null ? current.getHoldings() : List.of();
        } else {
            Portfolio current = portfolioService.getPortfolio();
            holdings = current != null ? current.getHoldings() : List.of();
        }
        for (Holding holding : holdings) {
            nasdaqMetadataService.lookupMetadata(holding.getTicker()).ifPresent(holding::setMetadata);
        }
        return holdings;
    }

    @PostMapping("/holdings/add")
    public void addHolding(@RequestBody Map<String, Object> request, HttpServletRequest httpRequest) {
        String ticker = (String) request.get("ticker");
        double shares = ((Number) request.get("shares")).doubleValue();
        Double price = request.containsKey("price") ? ((Number) request.get("price")).doubleValue() : null;
        Instant timestamp = request.containsKey("timestamp") ? Instant.parse((String) request.get("timestamp")) : null;

        if (demoSessionResolver.isDemoUser()) {
            DemoSession session = demoSessionResolver.resolveSession(httpRequest);
            User user = demoSessionResolver.getCurrentUser();
            demoSessionService.addHolding(session, user, ticker, shares, price, timestamp);
        } else {
            portfolioService.addHolding(ticker, shares, price, timestamp);
        }
    }

    @PostMapping("/holdings/remove")
    public JournalEntry removeHolding(@RequestBody Map<String, Object> request, HttpServletRequest httpRequest) {
        String ticker = (String) request.get("ticker");
        Double price = request.containsKey("price") ? ((Number) request.get("price")).doubleValue() : null;
        Instant timestamp = request.containsKey("timestamp") ? Instant.parse((String) request.get("timestamp")) : null;

        if (demoSessionResolver.isDemoUser()) {
            DemoSession session = demoSessionResolver.resolveSession(httpRequest);
            User user = demoSessionResolver.getCurrentUser();
            return demoSessionService.removeHolding(session, user, ticker, price, timestamp);
        } else {
            return portfolioService.removeHolding(ticker, price, timestamp);
        }
    }

    @GetMapping("/history")
    public List<PortfolioHistoryDTO> getPortfolioHistory(HttpServletRequest request) {
        if (demoSessionResolver.isDemoUser()) {
            return demoSessionService.getPortfolioHistory(demoSessionResolver.resolveSession(request));
        }
        return portfolioService.getPortfolioHistory();
    }

    @GetMapping("/transactions")
    public List<Transaction> getTransactionHistory(HttpServletRequest request) {
        if (demoSessionResolver.isDemoUser()) {
            return demoSessionService.getTransactions(demoSessionResolver.resolveSession(request));
        }
        return transactionService.getTransactionHistory();
    }

    @GetMapping("/demo-status")
    public Map<String, Object> getDemoStatus(HttpServletRequest request) {
        if (!demoSessionResolver.isDemoUser()) {
            throw new RuntimeException("Not a demo user");
        }
        DemoSession session = demoSessionResolver.resolveSession(request);
        return Map.of("remainingTrades", session.getRemainingTrades());
    }

    @GetMapping("/pnl")
    public PnLSummaryDTO getPnLSummary(HttpServletRequest request) {
        if (demoSessionResolver.isDemoUser()) {
            return demoSessionService.getPnLSummary(demoSessionResolver.resolveSession(request));
        }
        return portfolioService.getPnLSummary();
    }

    @PostMapping("/holdings/sell")
    public JournalEntry sellHolding(@RequestBody Map<String, Object> request, HttpServletRequest httpRequest) {
        String ticker = (String) request.get("ticker");
        double shares = ((Number) request.get("shares")).doubleValue();
        Double price = request.containsKey("price") ? ((Number) request.get("price")).doubleValue() : null;
        Instant timestamp = request.containsKey("timestamp") ? Instant.parse((String) request.get("timestamp")) : null;

        if (demoSessionResolver.isDemoUser()) {
            DemoSession session = demoSessionResolver.resolveSession(httpRequest);
            User user = demoSessionResolver.getCurrentUser();
            return demoSessionService.sellHolding(session, user, ticker, shares, price, timestamp);
        } else {
            return portfolioService.sellHolding(ticker, shares, price, timestamp);
        }
    }

}
