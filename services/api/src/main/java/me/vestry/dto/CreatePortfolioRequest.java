package me.vestry.dto;

import java.util.List;

public record CreatePortfolioRequest(List<HoldingInput> holdings) {
    public record HoldingInput(String ticker, double shares) {}
}
