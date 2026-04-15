package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.model.StockMetadata;
import jakarta.annotation.PostConstruct;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class NasdaqMetadataService {

    private final Map<String, StockMetadata> metadataCache = new ConcurrentHashMap<>();

    @PostConstruct
    public void loadMetadata() {
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(new ClassPathResource("data/nasdaq_metadata.csv").getInputStream()))) {
            
            String header = reader.readLine();
            if (header == null) return;

            String line;
            while ((line = reader.readLine()) != null) {
                String[] parts = parseCsvLine(line);
                if (parts.length < 10) continue;

                String ticker = parts[0].trim();
                String name = parts[1].trim();
                String marketCapStr = parts[5].trim().replaceAll("[^0-9.]", "");
                String country = parts[6].trim();
                String sector = parts[9].trim();
                String industry = parts.length > 10 ? parts[10].trim() : "";

                Double marketCap = null;
                try {
                    if (!marketCapStr.isEmpty()) {
                        marketCap = Double.parseDouble(marketCapStr);
                    }
                } catch (NumberFormatException e) {
                    // ignore invalid market cap
                }

                StockMetadata metadata = new StockMetadata();
                metadata.setTicker(ticker);
                metadata.setName(name);
                metadata.setCountry(country.isEmpty() ? null : country);
                metadata.setSector(sector.isEmpty() ? null : sector);
                metadata.setIndustry(industry.isEmpty() ? null : industry);
                metadata.setMarketCap(marketCap);
                metadata.setMarketCapTier(classifyMarketCap(marketCap));

                metadataCache.put(ticker, metadata);
            }
        } catch (Exception e) {
            System.err.println("Failed to load NASDAQ metadata CSV: " + e.getMessage());
        }
    }

    private String[] parseCsvLine(String line) {
        // Simple CSV parser handling quoted fields
        java.util.List<String> result = new java.util.ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean inQuotes = false;

        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"') {
                inQuotes = !inQuotes;
            } else if (c == ',' && !inQuotes) {
                result.add(current.toString().trim());
                current = new StringBuilder();
            } else {
                current.append(c);
            }
        }
        result.add(current.toString().trim());
        return result.toArray(new String[0]);
    }

    private String classifyMarketCap(Double marketCap) {
        if (marketCap == null) return null;
        if (marketCap >= 10_000_000_000.0) return "LARGE_CAP";
        if (marketCap >= 2_000_000_000.0) return "MID_CAP";
        if (marketCap >= 300_000_000.0) return "SMALL_CAP";
        return "MICRO_CAP";
    }

    public Optional<StockMetadata> lookupMetadata(String ticker) {
        return Optional.ofNullable(metadataCache.get(ticker));
    }
}
