package me.vestry.service;

import me.vestry.model.StockMetadata;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class NasdaqMetadataServiceTest {

    @Mock
    private EtfMetadataService etfMetadataService;

    @InjectMocks
    private NasdaqMetadataService nasdaqMetadataService;

    @BeforeEach
    void setUp() {
        nasdaqMetadataService.loadMetadata();
    }

    @Test
    void lookupMetadataReturnsNasdaqDataForStock() {
        Optional<StockMetadata> result = nasdaqMetadataService.lookupMetadata("AAPL");

        assertTrue(result.isPresent());
        StockMetadata metadata = result.get();
        assertEquals("AAPL", metadata.getTicker());
        assertFalse(metadata.isEtf());
    }

    @Test
    void lookupMetadataFallsBackToEtfServiceWhenNotInNasdaq() {
        String ticker = "SPY";
        StockMetadata etfMetadata = new StockMetadata();
        etfMetadata.setTicker(ticker);
        etfMetadata.setName("SPDR S\u0026P 500");
        etfMetadata.setEtf(true);

        when(etfMetadataService.lookupMetadata(ticker)).thenReturn(Optional.of(etfMetadata));

        Optional<StockMetadata> result = nasdaqMetadataService.lookupMetadata(ticker);

        assertTrue(result.isPresent());
        assertEquals("SPY", result.get().getTicker());
        assertTrue(result.get().isEtf());
        verify(etfMetadataService).lookupMetadata(ticker);
    }

    @Test
    void lookupMetadataReturnsEmptyWhenNotFoundInEitherSource() {
        String ticker = "UNKNOWN";
        when(etfMetadataService.lookupMetadata(ticker)).thenReturn(Optional.empty());

        Optional<StockMetadata> result = nasdaqMetadataService.lookupMetadata(ticker);

        assertFalse(result.isPresent());
        verify(etfMetadataService).lookupMetadata(ticker);
    }

    @Test
    void searchRanksExactTickerThenPrefixesByMarketCapAndSkipsUnpriceableTickers() {
        StockMetadata spy = new StockMetadata();
        spy.setTicker("SPY");
        spy.setName("SPDR S&P 500");
        spy.setEtf(true);
        when(etfMetadataService.allMetadata()).thenReturn(List.of(spy));

        assertEquals("AAPL", nasdaqMetadataService.search("aapl", 8).get(0).getTicker());
        assertEquals("AAPL", nasdaqMetadataService.search("Apple", 8).get(0).getTicker());
        assertTrue(nasdaqMetadataService.search("SPY", 8).get(0).isEtf());

        List<StockMetadata> brk = nasdaqMetadataService.search("BRK", 8);
        assertFalse(brk.isEmpty());
        assertTrue(brk.stream().noneMatch(metadata -> metadata.getTicker().contains("/")));

        List<StockMetadata> broad = nasdaqMetadataService.search("A", 8);
        assertEquals(8, broad.size());
        assertTrue(broad.get(1).getMarketCap() >= broad.get(2).getMarketCap());
        assertTrue(nasdaqMetadataService.search("  ", 8).isEmpty());
    }
}
