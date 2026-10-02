package me.vestry.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.databind.JsonNode;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.*;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private int id;

    @Column(unique = true, nullable = false)
    private String username;

    @Column(nullable = false)
    private String password;

    @Column(name = "is_demo", nullable = false)
    private boolean demo = false;

    @JsonIgnore
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "holdings_layout")
    private JsonNode holdingsLayout;

    @JsonIgnore
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "dashboard_layout")
    private JsonNode dashboardLayout;

    @OneToOne(mappedBy = "user", cascade = CascadeType.ALL)
    @JsonIgnore
    private Portfolio portfolio;

    public User () {}

    public User(String username, String password) {
        this.username = username;
        this.password = password;
    }
    
    public int getId() {
        return id;
    }

    public void setId(int id) {
        this.id = id;
    }

    public Portfolio getPortfolio() {
        return portfolio;
    }

    public void setPortfolio(Portfolio portfolio) {
        this.portfolio = portfolio;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public boolean isDemo() {
        return demo;
    }

    public void setDemo(boolean demo) {
        this.demo = demo;
    }

    public JsonNode getHoldingsLayout() {
        return holdingsLayout;
    }

    public void setHoldingsLayout(JsonNode holdingsLayout) {
        this.holdingsLayout = holdingsLayout;
    }

    public JsonNode getDashboardLayout() {
        return dashboardLayout;
    }

    public void setDashboardLayout(JsonNode dashboardLayout) {
        this.dashboardLayout = dashboardLayout;
    }
}
