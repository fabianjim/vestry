# Vestry — Agent Guide

> **Agent self-update rule**: When you implement a new feature, add a new route, introduce a new pattern, or make a meaningful architectural decision, you MUST update this file before ending the session. Update the relevant section — do not append a changelog to the bottom. This file should always reflect the current state of the codebase, not its history. If the change does not make a significant, meaningful impact for a future agent sessions to understand the context or current stage the project is it, it does not need to be added, althought this must be brought up to the user for confirmation.

---

## What This App Is

Vestry is a financial portfolio journaling app for casual traders. The goal is **reflection and decision quality**, not real-time trading. It is not a Robinhood clone.

Core philosophy:
- Prices are fetched **once per hour** during market hours. Do not add any logic that implies or requires real-time data.
- The app has two distinct modes: **Price Analysis** (time-series performance + journal annotations) and **Holding Analysis** (relational graph of holdings and watchlist stocks by shared characteristics).
- This is a portfolio project built to demonstrate product thinking and full-stack engineering. Code quality, architecture clarity, and UI polish matter, although do not remove any previous documentation, comments without direct approval from the user.

---

## Architecture

### Backend (Spring Boot)
```
src/main/java/com/github/fabianjim/portfoliomonitor/
├── api/              # External API clients (TiingoClient, MarketDataClient)
├── config/           # TestSchedulingConfig (profile-gated scheduling)
├── controller/       # REST endpoints (Portfolio, Auth, Stock, Watchlist, JournalEntry, Login)
├── dto/              # Data transfer objects
├── model/            # JPA entities
├── repository/       # Spring Data JPA repositories
├── security/         # SecurityConfig (CORS, BCryptPasswordEncoder, session-based auth)
└── service/          # Business logic (PortfolioService, StockService, TransactionService, etc.)
    └── ScheduledStockService.java   # Cron jobs: intraday (10AM-4PM EST) + EOD (4:30PM EST)

Entry point: PortfolioMonitorApplication.java (has @EnableScheduling)
```

### Frontend (React + Vite)
```
frontend/vite-project/src/
├── pages/           # Route components: Login.tsx, Dashboard.tsx, Portfolio.tsx, Analysis.tsx
├── components/      # UI components: PortfolioChart, WatchlistPanel, JournalPanel,
│                    #   TransactionHistory, NodeGraph, ChartPinLayer, etc.
├── services/        # API layer (api.ts) — all backend calls go through here
├── types/           # TypeScript interfaces (transaction.ts, watchlist.ts, journal.ts)
├── utils/           # Helper functions (dateUtils.ts, chartPins.ts)
└── index.css        # Global styles + custom font declarations
```

### Tech Stack
- **Backend**: Spring Boot 3.5.3, Java 17, Maven (use `./mvnw`, never bare `mvn`)
- **Frontend**: React 19, TypeScript ~5.8, Vite 7
- **Styling**: Tailwind CSS v4 is installed (`@tailwindcss/vite`) and **actively used** — all components use Tailwind utility classes. The design token system is defined in `index.css` via `@theme`.
- **Database**: PostgreSQL (AWS RDS in prod, local in dev), H2 (tests only)
- **Market Data**: Tiingo API (hourly, not real-time)
- **Deploy**: Backend → AWS Elastic Beanstalk (us-east-1), Frontend → Vercel

---

## Features Built

### Dashboard (Price Analysis)
- Displays total portfolio value, day's change, total holdings count
- Portfolio performance chart (hourly + daily toggle, date navigation)
- Holdings table with ticker, shares, current price, day change, market value, last updated
- Buy and sell stock actions
- Chart pin layer: journal entries rendered as typed pins directly on the performance chart. Pin color reflects outcome retroactively (green/red based on price movement after entry).

### Holding Analysis View (`/analysis` route)
- Force-directed node graph (D3.js) showing holdings and watchlist stocks as nodes
- Edges drawn between nodes sharing metadata characteristics (sector, country, market cap tier)
- Edge thickness reflects number of shared characteristics
- Real holdings: solid filled nodes sized by market value
- Watchlist stocks: hollow/outlined nodes, uniform size
- Clicking a node opens a detail panel with ticker metadata and linked journal entries

### Watchlist
- Users add tickers to a watchlist — these are NOT price fetched
- Purpose is relational context in the Holding Analysis graph only
- Metadata is fetched once from Tiingo (or Financial Modeling Prep free tier) on add and stored statically

### Stock Metadata
- Both holdings and watchlist stocks carry: sector, industry, country/region, market cap tier
- Fetched once at time of buy/add, stored statically, never updated automatically
- Powers the edge logic in the Holding Analysis graph

### Journal Entry System
- A journal entry has: type (`BUY`, `SELL`, `INSIGHT`, `MARKET_EVENT`), body text, optional ticker, timestamp, and snapshotted price at time of writing
- Created automatically (prompted after buy/sell — non-blocking, skippable) or manually
- Surfaces in two places: as pins on the price chart (Price Analysis) and in the node detail panel (Holding Analysis)
- The underlying data model is one unified journal entry object — not two separate systems

---

## Scheduling

`ScheduledStockService` runs two cron jobs (EST timezone):
- **Intraday**: Every hour 10AM–4PM Mon–Fri
- **EOD**: 4:30PM Mon–Fri

Scheduling is disabled in tests unless `test-scheduling` profile is active (`TestSchedulingConfig.java`).

---

## Development Commands

### Backend
```bash
./mvnw spring-boot:run                          # Run locally (dev profile)
./mvnw test                                     # Run all tests
./mvnw test -Dtest=PortfolioServiceTransactionTest  # Run single test class
./mvnw clean package -DskipTests               # Build deploy JAR
```

### Frontend
```bash
cd frontend/vite-project
npm run dev    # Dev server port 5173, proxies /api → localhost:8080
npm run build  # Includes tsc -b (no separate typecheck script)
npm run lint
```

### Full Stack (local)
1. Start PostgreSQL locally
2. `./mvnw spring-boot:run` (port 8080)
3. `cd frontend/vite-project && npm run dev` (port 5173)

---

## TDD Philosophy

- **New features**: Red/green TDD. Write a failing test first, then implement.
- **Bug fixes**: Fix directly, but add a regression test when done.
- **Frontend**: No test infrastructure currently configured. Vitest is installed as a devDependency but there is no test script in package.json.

---

## Testing Conventions

### Backend
- JUnit 5 + Mockito + `@MockitoBean` for Spring bean mocking
- Most test classes annotate: `@TestPropertySource(locations = "classpath:application-test.properties")`
- `TiingoAPIIntegrationTest` mocks `TiingoClient` — never hits the real Tiingo API in tests
- H2 for all repository/integration tests
- Tests located in `src/test/java/.../service/`, `controller/`, `repository/`, `model/`

---

## Important Constraints — Read Before Writing Any Code

**Do not:**
- Add real-time price fetching or WebSocket logic — prices are hourly by design
- Hardcode color or spacing values in new frontend components — use the Tailwind tokens defined in `index.css` `@theme`
- Install new charting libraries — check what is already in use first
- Mix Tailwind utility classes with inline styles
- Use bare `mvn` — always use `./mvnw`
- Commit secrets — `application-dev.properties` is gitignored and contains real credentials

**Always:**
- Add new Spring endpoints to the existing controller layer, following the naming and response conventions already there
- Route new API calls through `services/api.ts` on the frontend — do not call `fetch` directly in components
- Follow the existing TypeScript interface pattern in `types/` for any new data shapes
- Update this file if you add a feature, route, dependency, or architectural pattern

---

## Auth & Security

- Session-based Spring Security
- Frontend sends `credentials: 'include'` on all API calls
- CORS configured in `SecurityConfig.java` for `localhost:5173` and deployed domains
- If adding new local ports or deployed domains, update CORS origins in `SecurityConfig.java`

---

## Deploy Flow

### Backend (AWS Elastic Beanstalk)
- Trigger: Push to `main`
- Workflow: `.github/workflows/aws.yml`
- Steps: Java 17 (Corretto) → `./mvnw clean package -DskipTests` → Deploy JAR
- App: `portfolio-monitor-api`, env: `portfolio-monitor-api-env`, region: `us-east-1`

### Frontend (Vercel)
- Auto-deploys from repo
- `vercel.json` rewrites: `/api/*` → Elastic Beanstalk, `/*` → `index.html` (SPA)
- Dev proxy in `vite.config.ts`: `/api` → `http://localhost:8080`

---

## Key File Reference

| File | Purpose |
|---|---|
| `application.properties` | Active profile selector |
| `application-dev.properties` | Local dev config — DO NOT COMMIT |
| `application-prod.properties` | Prod config (env var driven) |
| `application-test.properties` | Test config (H2, no security) |
| `application.properties.example` | Template for new setups |
| `frontend/vite-project/vercel.json` | Production API routing |
| `frontend/vite-project/vite.config.ts` | Dev proxy config |
| `.github/workflows/aws.yml` | CI/CD for backend |

---

## UI & Design

The design system is a dark-mode-first aesthetic inspired by Linear's precision-engineered UI. It is built entirely on Tailwind CSS v4 `@theme` tokens defined in `index.css`.

### Philosophy
- **Darkness as the native medium**: The near-black background IS the whitespace. Content emerges through carefully calibrated luminance steps.
- **Cool gray palette with single accent**: The entire UI is achromatic (grays) except for one cool blue accent (`#5e9ed6`). This keeps the focus on data, not decoration.
- **Semi-transparent borders**: Borders use `rgba(255,255,255,0.08)` rather than solid colors, creating structure without visual noise.
- **Authentic Sans fonts**: `authentic-sans` (weights 60, 90, 130, 150) and `authentic-sans-condensed` — do not introduce new fonts.

### Color Palette (Tailwind Tokens)

All colors are available as Tailwind utilities (e.g., `bg-background`, `text-foreground`, `border-border`).

| Token | Hex / Value | Usage |
|-------|-------------|-------|
| `background` | `#2d2d2d` | Page background, deepest canvas |
| `surface` | `#32393d` | Cards, panels, table backgrounds |
| `surface-hover` | `#373737` | Hover states, slightly elevated surfaces |
| `elevated` | `#464646` | Borders, dividers, toolbar buttons |
| `foreground` | `#bdbdbd` | Primary text — headings, body |
| `secondary` | `#9ca3af` | Secondary text — labels, descriptions |
| `muted` | `#6b7280` | Muted text — timestamps, placeholders, disabled |
| `border` | `rgba(255,255,255,0.08)` | Default border — cards, inputs, dividers |
| `border-solid` | `#464646` | Solid border variant when needed |
| `primary` | `#5e9ed6` | Accent — buttons, links, active states |
| `primary-hover` | `#7ab8e8` | Accent hover state |
| `primary-foreground` | `#ffffff` | Text on primary backgrounds |
| `gain` | `#10b981` | Positive numbers, buy actions, success |
| `loss` | `#ef4444` | Negative numbers, sell actions, error |
| `success` | `#10b981` | Success messages, confirmations |
| `error` | `#ef4444` | Error messages, validation |
| `overlay` | `rgba(0,0,0,0.85)` | Modal/dialog backdrops |

### Font Weights (Tailwind Tokens)

The `authentic-sans` font family uses non-standard weights. Tailwind utilities are mapped to the actual loaded font weights:

| Token | Value | Usage |
|-------|-------|-------|
| `font-60` | `60` | Ultra-light, de-emphasized text |
| `font-90` | `90` | Body text, default page weight |
| `font-130` | `130` | Emphasis, headings, labels, table headers |
| `font-150` | `150` | Maximum emphasis, hero numbers |

Default body weight is `90`. Use `font-130` instead of standard `font-bold`.

### Component Patterns

**Inputs**
- `bg-surface-hover border-border rounded-md text-foreground placeholder-muted`
- Focus: `focus:outline-none focus:ring-2 focus:ring-primary`

**Buttons**
- Primary: `bg-primary text-primary-foreground hover:bg-primary-hover`
- Secondary/Ghost: `bg-surface border-border hover:bg-surface-hover`
- Danger: `bg-error text-white hover:bg-error/80`
- Success: `bg-gain text-white hover:bg-gain/80`

**Cards / Panels**
- `bg-surface rounded-lg border border-border`
- Hover: `hover:bg-surface-hover transition-colors`

**Tables**
- Header: `bg-elevated`
- Row: `bg-surface hover:bg-surface-hover transition-colors`
- Cell borders: `border-border`

### Do's and Don'ts

**Do:**
- Use the Tailwind tokens from `@theme` for all colors, borders, and backgrounds
- Apply `transition-colors` to interactive elements
- Use `focus:outline-none focus:ring-2 focus:ring-primary` for focus states
- Keep the dark aesthetic consistent across all pages

**Don't:**
- Hardcode hex values in components — always use the theme tokens
- Mix Tailwind classes with inline `style={{}}` — pick one (Tailwind)
- Use pure white (`#ffffff`) as text — `#bdbdbd` (foreground) prevents eye strain
- Introduce warm colors or additional accent colors beyond the defined palette

