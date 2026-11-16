package me.vestry.service;

import me.vestry.api.HindsightClient.BriefingHolding;
import me.vestry.api.HindsightClient.BriefingTrade;
import me.vestry.api.HindsightClient.HoldingMetadata;
import me.vestry.model.Holding;
import me.vestry.model.Portfolio;
import me.vestry.model.Stock;
import me.vestry.model.StockMetadata;
import me.vestry.model.Transaction;
import me.vestry.model.User;
import me.vestry.repository.PortfolioRepository;
import me.vestry.repository.TransactionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class BriefingFactsServiceTest {
    private static final Instant NOW = Instant.parse("2026-11-13T15:02:11Z");
    private static final Instant PRICED_AT = Instant.parse("2026-11-13T15:00:00Z");

    private final PortfolioRepository portfolios = mock(PortfolioRepository.class);
    private final PortfolioService prices = mock(PortfolioService.class);
    private final TransactionRepository transactions = mock(TransactionRepository.class);
    private final NasdaqMetadataService metadata = mock(NasdaqMetadataService.class);
    private final BriefingFactsService service = new BriefingFactsService(portfolios, prices, transactions, metadata,
            Clock.fixed(NOW, ZoneOffset.UTC));
    private final User user = new User();

    @BeforeEach
    void setup() {
        user.setId(7);
        when(metadata.lookupMetadata(anyString())).thenReturn(Optional.empty());
    }

    private void holds(Holding... holdings) {
        when(portfolios.findByUserId(7)).thenReturn(Optional.of(new Portfolio(user, new ArrayList<>(List.of(holdings)))));
    }

    private void priced(String ticker, double price) {
        when(prices.getStockData(ticker)).thenReturn(new Stock(ticker, PRICED_AT, price, 0, 0, 0, 0, null, null));
    }

    private static Transaction trade(String ticker, double shares, double price, Transaction.TransactionType type) {
        var trade = new Transaction(ticker, shares, price, type);
        trade.setTimestamp(NOW.minusSeconds(3600));
        return trade;
    }

    @Test
    void sendsValuesWeightsMetadataAndTheWeeksTrades() {
        holds(new Holding("MSFT", 10), new Holding("AAPL", 5));
        priced("MSFT", 300);
        priced("AAPL", 200);
        when(metadata.lookupMetadata("MSFT")).thenReturn(Optional.of(
                new StockMetadata("MSFT", "M".repeat(150), "United States", "Technology", "Software")));
        when(transactions.findTop12ByUserIdAndTimestampGreaterThanAndTimestampLessThanEqualOrderByTimestampDescIdDesc(
                7, NOW.minus(BriefingFactsService.ACTIVITY), NOW))
                .thenReturn(List.of(trade("MSFT", 2, 410.2, Transaction.TransactionType.BUY),
                        trade("BAD TICKER", 1, 1, Transaction.TransactionType.SELL),
                        trade("AAPL", 1, 0, Transaction.TransactionType.SELL)));

        var request = service.capture(user);

        assertEquals(NOW, request.capturedAt());
        assertFalse(request.demo());
        assertEquals(4000.0, request.portfolioValue());
        assertEquals(List.of(
                new BriefingHolding("MSFT", 10, 3000.0, PRICED_AT, 75.0,
                        new HoldingMetadata("M".repeat(100), "Technology", "Software", "United States")),
                new BriefingHolding("AAPL", 5, 1000.0, PRICED_AT, 25.0, null)), request.holdings());
        assertEquals(List.of(new BriefingTrade("MSFT", "BUY", 2, 410.2, NOW.minusSeconds(3600))), request.trades(),
                "rows hindsight would reject are left out");
    }

    @Test
    void anUnpricedOrSkippedHoldingLeavesTheTotalAndWeightsUnknown() {
        holds(new Holding("MSFT", 10), new Holding("NEW", 3), new Holding("BAD TICKER", 1));
        priced("MSFT", 300);

        var request = service.capture(user);

        assertNull(request.portfolioValue());
        assertEquals(List.of(new BriefingHolding("MSFT", 10, 3000.0, PRICED_AT, null, null),
                new BriefingHolding("NEW", 3, null, null, null, null)), request.holdings());
    }

    @Test
    void sendsAtMostEightHoldingsAndAnEmptyPortfolio() {
        holds(IntStream.range(0, 9).mapToObj(i -> new Holding("T" + i, 1)).toArray(Holding[]::new));
        IntStream.range(0, 9).forEach(i -> priced("T" + i, 10));

        var request = service.capture(user);

        assertEquals(BriefingFactsService.MAX_HOLDINGS, request.holdings().size());
        assertNull(request.portfolioValue());

        when(portfolios.findByUserId(7)).thenReturn(Optional.empty());
        var empty = service.capture(user);
        assertEquals(List.of(), empty.holdings());
        assertEquals(0.0, empty.portfolioValue());
    }

    @Test
    void theScheduleOnlyCapturesTheDemoTemplate() {
        assertThrows(IllegalArgumentException.class, () -> service.captureDemo(user));

        user.setDemo(true);
        assertTrue(service.captureDemo(user).demo());
    }
}
