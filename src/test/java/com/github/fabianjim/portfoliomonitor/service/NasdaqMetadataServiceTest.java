package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.model.StockMetadata;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

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
}
