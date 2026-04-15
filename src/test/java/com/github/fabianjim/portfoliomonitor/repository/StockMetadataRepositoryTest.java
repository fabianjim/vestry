package com.github.fabianjim.portfoliomonitor.repository;

import com.github.fabianjim.portfoliomonitor.model.StockMetadata;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
@ActiveProfiles("test")
class StockMetadataRepositoryTest {

    @Autowired
    private StockMetadataRepository stockMetadataRepository;

    @Test
    void testSaveAndFindByTicker() {
        StockMetadata metadata = new StockMetadata();
        metadata.setTicker("AAPL");
        metadata.setName("Apple Inc.");
        metadata.setCountry("United States");
        metadata.setSector("Technology");
        metadata.setIndustry("Consumer Electronics");
        metadata.setMarketCap(3500000000000.0);
        metadata.setMarketCapTier("LARGE_CAP");

        StockMetadata saved = stockMetadataRepository.save(metadata);

        assertNotNull(saved);
        assertEquals("AAPL", saved.getTicker());

        Optional<StockMetadata> found = stockMetadataRepository.findByTicker("AAPL");
        assertTrue(found.isPresent());
        assertEquals("Apple Inc.", found.get().getName());
        assertEquals("Technology", found.get().getSector());
        assertEquals("LARGE_CAP", found.get().getMarketCapTier());
    }

    @Test
    void testExistsByTicker() {
        StockMetadata metadata = new StockMetadata();
        metadata.setTicker("GOOGL");
        metadata.setName("Alphabet Inc.");
        metadata.setCountry("United States");
        metadata.setSector("Communication Services");
        metadata.setIndustry("Internet Content & Information");
        metadata.setMarketCap(2000000000000.0);
        metadata.setMarketCapTier("LARGE_CAP");

        stockMetadataRepository.save(metadata);

        assertTrue(stockMetadataRepository.existsByTicker("GOOGL"));
        assertFalse(stockMetadataRepository.existsByTicker("UNKNOWN"));
    }
}
