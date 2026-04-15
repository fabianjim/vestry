package com.github.fabianjim.portfoliomonitor.model;

import jakarta.persistence.*;

@Entity
@Table(name = "stock_metadata")
public class StockMetadata {

    @Id
    @Column(nullable = false)
    private String ticker;

    @Column(nullable = true)
    private String name;

    @Column(nullable = true)
    private String country;

    @Column(nullable = true)
    private String sector;

    @Column(nullable = true)
    private String industry;

    @Column(name = "market_cap", nullable = true)
    private Double marketCap;

    @Column(name = "market_cap_tier", nullable = true)
    private String marketCapTier;

    public StockMetadata() {}

    public StockMetadata(String ticker, String name, String country, String sector, String industry) {
        this.ticker = ticker;
        this.name = name;
        this.country = country;
        this.sector = sector;
        this.industry = industry;
    }

    public String getTicker() {
        return ticker;
    }

    public void setTicker(String ticker) {
        this.ticker = ticker;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getCountry() {
        return country;
    }

    public void setCountry(String country) {
        this.country = country;
    }

    public String getSector() {
        return sector;
    }

    public void setSector(String sector) {
        this.sector = sector;
    }

    public String getIndustry() {
        return industry;
    }

    public void setIndustry(String industry) {
        this.industry = industry;
    }

    public Double getMarketCap() {
        return marketCap;
    }

    public void setMarketCap(Double marketCap) {
        this.marketCap = marketCap;
    }

    public String getMarketCapTier() {
        return marketCapTier;
    }

    public void setMarketCapTier(String marketCapTier) {
        this.marketCapTier = marketCapTier;
    }
}
