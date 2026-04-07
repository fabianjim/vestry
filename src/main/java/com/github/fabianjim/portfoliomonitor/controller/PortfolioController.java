package com.github.fabianjim.portfoliomonitor.controller;

import com.github.fabianjim.portfoliomonitor.dto.PortfolioHistoryDTO;
import com.github.fabianjim.portfoliomonitor.model.Holding;
import com.github.fabianjim.portfoliomonitor.model.Portfolio;
import com.github.fabianjim.portfoliomonitor.model.Transaction;
import com.github.fabianjim.portfoliomonitor.model.TrackedStock;
import com.github.fabianjim.portfoliomonitor.service.PortfolioService;
import com.github.fabianjim.portfoliomonitor.service.TransactionService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/portfolio")
public class PortfolioController {

    private final PortfolioService portfolioService;
    private final TransactionService transactionService;

    public PortfolioController(PortfolioService portfolioService, TransactionService transactionService) {
        this.portfolioService = portfolioService;
        this.transactionService = transactionService;
    }
    @PostMapping
    public void submitPortfolio(@RequestBody Portfolio portfolio) {
        portfolioService.updatePortfolio(portfolio);
    }
    @PostMapping("/create")
    public void createPortfolio(@RequestBody Portfolio portfolio) {
        portfolioService.createPortfolio(portfolio);
    }

    // TODO
    @PostMapping("/update")
    public void updatePortfolio(@RequestBody Portfolio portfolio) {
        portfolioService.updatePortfolio(portfolio);
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
        return current != null ? current.getHoldings() : List.of();
    }

    @PostMapping("/holdings/add")
    public void addHolding(@RequestBody Map<String, Object> request) {
        String ticker = (String) request.get("ticker");
        double shares = ((Number) request.get("shares")).doubleValue();
        portfolioService.addHolding(ticker, shares);
    }

    @PostMapping("/holdings/remove")
    public void removeHolding(@RequestBody Map<String, String> request) {
        String ticker = request.get("ticker");
        portfolioService.removeHolding(ticker);
    }

    @GetMapping("/trending")
    public List<TrackedStock> getTrendingStocks() {
        return portfolioService.getTopTrendingStocks(3);
    }

    @GetMapping("/history")
    public List<PortfolioHistoryDTO> getPortfolioHistory() {
        return portfolioService.getPortfolioHistory();
    }

    @GetMapping("/transactions")
    public List<Transaction> getTransactionHistory() {
        return transactionService.getTransactionHistory();
    }

    @PostMapping("/holdings/sell")
    public void sellHolding(@RequestBody Map<String, Object> request) {
        String ticker = (String) request.get("ticker");
        double shares = ((Number) request.get("shares")).doubleValue();
        portfolioService.sellHolding(ticker, shares);
    }

}
