package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.model.StockMetadata;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(MockitoExtension.class)
public class EtfMetadataServiceTest {

    private EtfMetadataService etfMetadataService;

    @BeforeEach
    void setUp() {
        etfMetadataService = new EtfMetadataService();
        etfMetadataService.loadEtfMetadata();
    }

    @Test
    void lookupMetadataReturnsEtfData() {
        Optional<StockMetadata> result = etfMetadataService.lookupMetadata("SPY");

        assertTrue(result.isPresent());
        StockMetadata metadata = result.get();
        assertEquals("SPY", metadata.getTicker());
        assertEquals("SPDR S\u0026P 500", metadata.getName());
        assertEquals("Equity", metadata.getSector());
        assertEquals("Large Cap Blend Equities", metadata.getIndustry());
        assertEquals("U.S.", metadata.getCountry());
        assertTrue(metadata.isEtf());
        assertNotNull(metadata.getMarketCap());
        assertEquals("LARGE_CAP", metadata.getMarketCapTier());
    }

    @Test
    void lookupMetadataReturnsEmptyForUnknownTicker() {
        Optional<StockMetadata> result = etfMetadataService.lookupMetadata("UNKNOWN");
        assertFalse(result.isPresent());
    }

    @Test
    void lookupMetadataHandlesMissingValues() {
        Optional<StockMetadata> result = etfMetadataService.lookupMetadata("ADZ");

        assertTrue(result.isPresent());
        StockMetadata metadata = result.get();
        assertEquals("ADZ", metadata.getTicker());
        assertTrue(metadata.isEtf());
        // ADZ has Asset="Commodity" and empty Region in the CSV
        assertEquals("Commodity", metadata.getSector());
        assertNull(metadata.getCountry());
    }

    @Test
    void lookupMetadataHandlesNonNumericMarketCap() {
        Optional<StockMetadata> result = etfMetadataService.lookupMetadata("ASO");

        assertTrue(result.isPresent());
        StockMetadata metadata = result.get();
        assertEquals("ASO", metadata.getTicker());
        assertNull(metadata.getMarketCap());
        assertNull(metadata.getMarketCapTier());
    }
}
