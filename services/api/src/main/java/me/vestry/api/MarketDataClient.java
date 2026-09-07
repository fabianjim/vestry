package me.vestry.api;

import me.vestry.model.Stock;
import me.vestry.model.Stock.StockType;

public interface MarketDataClient {
    /**
     * Fetch current price of the associated ticker stock
     * @param ticker symbol
     * @return current ticker price for one share
     */
    double getCurrentPrice(String ticker);

    /**
     * Sends request to API to test connection
     * @return string verifying successful authentication and connection
     */
    String testConnection();

    /**
     * Fetch detailed stock data for the ticker passed from the market API
     * @param ticker listed for the stock
     * @param type the type of stock data (INITIAL, EOD, INTRADAY)
     * @return Stock object with data retrieval timestamp, current price, day opening price, previous day's closing price,
     * highest price today, and lowest price today of the stock
     */
    Stock getStockData(String ticker, StockType type);
}
