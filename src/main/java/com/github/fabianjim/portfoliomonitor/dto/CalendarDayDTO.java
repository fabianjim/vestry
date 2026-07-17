package com.github.fabianjim.portfoliomonitor.dto;

public class CalendarDayDTO {

    private String date;
    private int count;

    public CalendarDayDTO() {}

    public CalendarDayDTO(String date, int count) {
        this.date = date;
        this.count = count;
    }

    public String getDate() {
        return date;
    }

    public void setDate(String date) {
        this.date = date;
    }

    public int getCount() {
        return count;
    }

    public void setCount(int count) {
        this.count = count;
    }
}
