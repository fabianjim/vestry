package me.vestry.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "stocks", 
       uniqueConstraints = {@UniqueConstraint(columnNames = {"ticker", "timestamp"})})
public class Stock {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private int id;

    @Column(nullable = false)
    private String ticker;
    
    @Column(nullable = false)
    private Instant timestamp;
    
    @Column(name = "hour_bucket", nullable = false)
    private Instant hourBucket;
    
    @Column(name = "current_price", nullable = false)
    private double currentPrice;
    
    @Column(nullable = false)
    private double open;
    
    @Column(name = "prev_close", nullable = false)
    private double prevClose;
    
    @Column(nullable = false)
    private double high;
    
    @Column(nullable = false)
    private double low;

    @Column(nullable = true)
    @Enumerated(EnumType.STRING)
    private StockType type;

    public Stock() {};

    public Stock(String ticker, Instant timestamp, double currentPrice, double open, double prevClose, double high, double low, StockType type, Instant hourBucket) {
        this.ticker = ticker;
        this.timestamp = timestamp;
        this.hourBucket = hourBucket;
        this.currentPrice = currentPrice;
        this.open = open;
        this.prevClose = prevClose;
        this.high = high;
        this.low = low;
        this.type = type;
    };
    

    public enum StockType {
        EOD,
        INTRADAY,
        INITIAL
    }

    public int getId() {
        return id;
    }

    public void setId(int id) {
        this.id = id;
    }

    public void setTicker(String ticker) {
        this.ticker = ticker;
    }

    public String getTicker() {
        return ticker;
    }

    public void setCurrentPrice(double currentPrice) {
        this.currentPrice = currentPrice;
    }

    public double getCurrentPrice() {
        return currentPrice;
    }

    public void setHigh(double high) {
        this.high = high;
    }

    public double getHigh() {
        return high;
    }

    public void setLow(double low) {
        this.low = low;
    }

    public double getLow() {
        return low;
    }

    public void setOpen(double open) {
        this.open = open;
    }

    public double getOpen() {
        return open;
    }
    public void setPrevClose(double prevClose) {
        this.prevClose = prevClose;
    }

    public double getPrevClose() {
        return prevClose;
    }

    public void setTimestamp(Instant timestamp) {
        this.timestamp = timestamp;
    }

    public Instant getTimestamp() {
        return timestamp;
    }

    public Instant getHourBucket() {
        return hourBucket;
    }

    public void setHourBucket(Instant hourBucket) {
        this.hourBucket = hourBucket;
    }

    public void setType(StockType type) {
        this.type = type;
    }

    public StockType getType() {
        return type;
    }
}
