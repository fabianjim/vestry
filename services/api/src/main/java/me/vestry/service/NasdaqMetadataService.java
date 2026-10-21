package me.vestry.service;

import me.vestry.model.StockMetadata;
import jakarta.annotation.PostConstruct;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class NasdaqMetadataService {

    private static final int NO_MATCH = 3;

    private final Map<String, StockMetadata> metadataCache = new ConcurrentHashMap<>();
    private final EtfMetadataService etfMetadataService;

    public NasdaqMetadataService(EtfMetadataService etfMetadataService) {
        this.etfMetadataService = etfMetadataService;
    }

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
                metadata.setEtf(false);

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
        StockMetadata nasdaqMetadata = metadataCache.get(ticker);
        if (nasdaqMetadata != null) {
            return Optional.of(nasdaqMetadata);
        }
        return etfMetadataService.lookupMetadata(ticker);
    }

    /**
     * Ranks an exact ticker first, then ticker or name prefixes, then later name words,
     * with larger market caps first inside each tier.
     */
    public List<StockMetadata> search(String query, int limit) {
        String q = query == null ? "" : query.trim().toUpperCase(Locale.ROOT);
        if (q.isEmpty()) return List.of();

        // Stocks replace ETFs with the same ticker, matching lookupMetadata.
        Map<String, StockMetadata> candidates = new HashMap<>();
        etfMetadataService.allMetadata().forEach(metadata -> candidates.put(metadata.getTicker(), metadata));
        candidates.putAll(metadataCache);

        Comparator<StockMetadata> order = Comparator
                .<StockMetadata>comparingInt(metadata -> searchTier(metadata, q))
                .thenComparing(metadata -> metadata.getMarketCap() == null ? 0.0 : metadata.getMarketCap(),
                        Comparator.reverseOrder())
                .thenComparing(StockMetadata::getTicker);
        return candidates.values().stream()
                .filter(metadata -> isPriceable(metadata.getTicker()))
                .filter(metadata -> searchTier(metadata, q) < NO_MATCH)
                .sorted(order)
                .limit(limit)
                .toList();
    }

    private static int searchTier(StockMetadata metadata, String q) {
        String ticker = metadata.getTicker();
        if (ticker.equals(q)) return 0;
        String name = metadata.getName() == null ? "" : metadata.getName().toUpperCase(Locale.ROOT);
        if (ticker.startsWith(q) || name.startsWith(q)) return 1;
        if (name.contains(" " + q)) return 2;
        return NO_MATCH;
    }

    // The CSV writes share classes and preferreds as BRK/B and ABC^A, which the price feed does not accept.
    private static boolean isPriceable(String ticker) {
        return ticker.indexOf('/') < 0 && ticker.indexOf('^') < 0;
    }
}
