package com.github.fabianjim.portfoliomonitor.controller;

import com.github.fabianjim.portfoliomonitor.dto.PnLSummaryDTO;
import com.github.fabianjim.portfoliomonitor.dto.PortfolioHistoryDTO;
import com.github.fabianjim.portfoliomonitor.model.Holding;
import com.github.fabianjim.portfoliomonitor.model.Portfolio;
import com.github.fabianjim.portfoliomonitor.model.Transaction;

import com.github.fabianjim.portfoliomonitor.service.NasdaqMetadataService;
import com.github.fabianjim.portfoliomonitor.service.PortfolioService;
import com.github.fabianjim.portfoliomonitor.service.TransactionService;
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

    public PortfolioController(PortfolioService portfolioService, TransactionService transactionService, NasdaqMetadataService nasdaqMetadataService) {
        this.portfolioService = portfolioService;
        this.transactionService = transactionService;
        this.nasdaqMetadataService = nasdaqMetadataService;
    }
    
    @PostMapping("/create")
    public void createPortfolio(@RequestBody Portfolio portfolio) {
        portfolioService.createPortfolio(portfolio);
    }

    @GetMapping
    public Portfolio getPortfolio() {
        return portfolioService.getPortfolio();
    }

    @GetMapping("/exists")
    public boolean exists() {
        return portfolioService.existsByUserId();
    }

    @GetMapping("/holdings")
    public List<Holding> fetchHoldings() {
        Portfolio current = portfolioService.getPortfolio();
        List<Holding> holdings = current != null ? current.getHoldings() : List.of();
        for (Holding holding : holdings) {
            nasdaqMetadataService.lookupMetadata(holding.getTicker()).ifPresent(holding::setMetadata);
        }
        return holdings;
    }

    @PostMapping("/holdings/add")
    public void addHolding(@RequestBody Map<String, Object> request) {
        String ticker = (String) request.get("ticker");
        double shares = ((Number) request.get("shares")).doubleValue();
        Double price = request.containsKey("price") ? ((Number) request.get("price")).doubleValue() : null;
        Instant timestamp = request.containsKey("timestamp") ? Instant.parse((String) request.get("timestamp")) : null;
        portfolioService.addHolding(ticker, shares, price, timestamp);
    }

    @PostMapping("/holdings/remove")
    public void removeHolding(@RequestBody Map<String, Object> request) {
        String ticker = (String) request.get("ticker");
        Double price = request.containsKey("price") ? ((Number) request.get("price")).doubleValue() : null;
        Instant timestamp = request.containsKey("timestamp") ? Instant.parse((String) request.get("timestamp")) : null;
        portfolioService.removeHolding(ticker, price, timestamp);
    }

    @GetMapping("/history")
    public List<PortfolioHistoryDTO> getPortfolioHistory() {
        return portfolioService.getPortfolioHistory();
    }

    @GetMapping("/transactions")
    public List<Transaction> getTransactionHistory() {
        return transactionService.getTransactionHistory();
    }

    @GetMapping("/pnl")
    public PnLSummaryDTO getPnLSummary() {
        return portfolioService.getPnLSummary();
    }

    @PostMapping("/holdings/sell")
    public void sellHolding(@RequestBody Map<String, Object> request) {
        String ticker = (String) request.get("ticker");
        double shares = ((Number) request.get("shares")).doubleValue();
        Double price = request.containsKey("price") ? ((Number) request.get("price")).doubleValue() : null;
        Instant timestamp = request.containsKey("timestamp") ? Instant.parse((String) request.get("timestamp")) : null;
        portfolioService.sellHolding(ticker, shares, price, timestamp);
    }

}
