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
├── controller/       # REST endpoints (Portfolio, Auth, Stock, Watchlist, JournalEntry, Login, Events)
│   └── GlobalExceptionHandler.java  # @ControllerAdvice — maps exceptions to HTTP responses
├── dto/              # Data transfer objects
├── event/            # Spring application events + SSE broadcasting for hourly price fetches
├── exception/        # Custom exceptions: UnknownTickerException, PriceFetchException
├── model/            # JPA entities
├── repository/       # Spring Data JPA repositories
├── security/         # SecurityConfig (CORS, BCryptPasswordEncoder, session-based auth)
└── service/          # Business logic (PortfolioService, StockService, TransactionService, etc.)
    ├── ScheduledStockService.java   # Cron jobs: intraday (10AM-4PM EST) + EOD (4:30PM EST); publishes fetch-complete events
    ├── NasdaqMetadataService.java   # Loads nasdaq_metadata.csv; falls back to EtfMetadataService
    └── EtfMetadataService.java      # Loads ETFs.csv with Asset→sector, Category→industry, Region→country mapping

Entry point: PortfolioMonitorApplication.java (has @EnableScheduling)
```

### Frontend (React + Vite)
```
frontend/vite-project/src/
├── pages/           # Route components: Login.tsx, Dashboard.tsx, Portfolio.tsx, Analysis.tsx
├── components/      # UI components: PortfolioChart, WatchlistPanel, JournalPanel,
│                    #   TransactionHistory, HoldingGraph, ChartPinLayer, etc.
├── services/        # API layer (api.ts) — all backend calls go through here
├── types/           # TypeScript interfaces (transaction.ts, watchlist.ts, journal.ts)
├── utils/           # Helper functions (dateUtils.ts, chartPins.ts)
└── index.css        # Global styles + custom font declarations
```

**Component refresh coordination**: `PortfolioChart` and `JournalPanel` expose imperative handles via `forwardRef` + `useImperativeHandle` so parent components (e.g. `Dashboard`) can trigger data refreshes after mutations. This pattern is used after buy/sell flows complete and the journal prompt closes.

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
- Displays total portfolio value, day's change, **total P/L** (unrealized + realized with percentage)
- Dashboard top header shows a **Next Update** timer pill next to the page title. It counts down to the next scheduled hourly fetch and displays the info tooltip: "Portfolio data is updated hourly on trading days (10am-4pm)". Driven by `useNextUpdate.ts` and `NextUpdateTimer.tsx`.
- Right sidebar shows **holdings count** and **watchlist count** next to their respective headers
- Portfolio performance chart (hourly + daily toggle, date navigation)
- Holdings table with ticker, shares, current price, day change, market value, last updated
- Buy and sell stock actions
- Chart pin layer: journal entries rendered as typed pins directly on the performance chart. Pin color reflects outcome retroactively (green/red based on price movement after entry).
- **Auto-refresh on hourly fetch**: The dashboard opens an SSE stream to `GET /api/events`. When the backend completes a scheduled hourly price fetch, it broadcasts a `priceFetchCompleted` event; the dashboard then refreshes holdings, P/L summary, and the portfolio chart automatically.

### Server-Sent Events (SSE)
- `ScheduledStockService` publishes a `PriceFetchCompletedEvent` after each intraday and EOD fetch completes.
- `PriceFetchEventService` maintains active `SseEmitter` subscriptions and broadcasts `priceFetchCompleted` events to all connected clients.
- `EventController` exposes the authenticated endpoint `GET /api/events` for the frontend to subscribe.
- The frontend subscribes with `EventSource('/api/events', { withCredentials: true })` in `Dashboard.tsx` and triggers the same refresh functions used after manual buy/sell flows.

### Portfolio History Calculation
- `PortfolioService.getPortfolioHistory()` groups stock data by `hourBucket` and calculates portfolio value at each bucket
- **Critical logic**: Only holdings with `buyTimestamp <= hourBucket` are included in the calculation for that bucket. This ensures:
  - Pre-buy hours show the portfolio without the new holding
  - Post-buy hours include the new holding (if price data exists)
  - After-hours buys don't wipe existing intraday history (the new holding simply isn't counted in earlier buckets)
- A bucket is only included if **all active holdings** (those that existed at that time) have price data
- EOD data is explicitly excluded from history calculations
- **Stock data `hourBucket` behavior**: `INTRADAY` data rounds to nearest hour; `EOD` data pins to 4:00 PM; `INITIAL` data (fetched when buying or creating a portfolio) uses the **exact timestamp** so the graph shows the precise portfolio creation time rather than rounding to the next hour

### P/L Tracking
- **Total P/L** shown on Dashboard using average cost basis method per ticker
- **Unrealized P/L**: current value minus cost basis for held positions
- **Realized P/L**: sell proceeds minus cost basis for sold positions (lifetime, includes fully sold positions)
- **Transaction History** page shows separate Unrealized and Realized P/L summary cards above the transaction table
- Backend endpoint: `GET /api/portfolio/pnl` returns `PnLSummaryDTO`

### Holding Analysis View (`/analysis` route)
- Interactive node graph (`HoldingGraph.tsx`) using D3.js to visualize holdings and watchlist stocks
- Edges drawn between nodes sharing metadata characteristics (sector, country, market cap tier)
- Edge thickness reflects number of shared characteristics
- Real holdings: solid filled nodes sized by market value
- Watchlist stocks: hollow/outlined nodes, uniform size
- Clicking a node opens a detail panel with ticker metadata and linked journal entries
- **Graph physics prioritize user control over rigid clustering:**
  - Forces (attraction, repulsion, collision) are intentionally weak and decay with alpha
  - Nodes bloom outward from the center on startup with an organic scatter animation
  - "Group by Sector" is a startup placement hint only: same-sector nodes initialize near each other and a transient sector force nudges them during the bloom, but it fades once alpha decays
  - Users can freely drag nodes; collision prevents overlap while preserving fluidity
  - All force parameters are centralized in `HoldingGraph.tsx` and tuned for subtle motion rather than automatic reorganization

### Watchlist
- Users add tickers to a watchlist — these are NOT price fetched
- Purpose is relational context in the Holding Analysis graph only
- Metadata is fetched from the unified metadata service (`NasdaqMetadataService` with ETF fallback) on load and attached transiently

### Stock & ETF Metadata
- Both holdings and watchlist stocks carry: sector, industry, country/region, market cap tier
- ETFs are supported via a separate `ETFs.csv` file with normalized metadata mapping:
  - `Asset` → `sector`
  - `Category` → `industry`
  - `Region` → `country`
- `StockMetadata` includes an `isEtf` boolean flag; the UI shows conditional labels ("Asset Class"/"Category"/"Region" for ETFs, "Sector"/"Industry"/"Country" for stocks)
- Fetched once at time of buy/add, stored statically, never updated automatically
- Powers the edge logic in the Holding Analysis graph

### Buy/Sell Error Handling
- `PortfolioService.fetchTransactionPrice()` fetches live prices before recording transactions
- **Unknown tickers** (`UnknownTickerException`, e.g., "NIKE" instead of "NKE"): thrown immediately, **no retry** — saves an unnecessary API call
- **Fetch failures** (`PriceFetchException`, e.g., API timeout): retried once after 500ms, then fails with a descriptive message
- `GlobalExceptionHandler` maps these to HTTP 404 (unknown ticker) and 503 (fetch failure) with user-friendly JSON error messages
- Frontend (`Dashboard.tsx`) reads `response.json().error` and displays it in the modal — no hardcoded error strings

### Journal Entry System
- A journal entry has: type (`BUY`, `SELL`, `INSIGHT`, `MARKET_EVENT`), body text, optional ticker, timestamp, and snapshotted price at time of writing
- Created automatically (prompted after buy/sell — non-blocking, skippable) or manually
- **Edit & Delete**: Entries in the `JournalPanel` show Edit/Delete buttons on hover (bottom right of the card)
  - **Edit**: Inline editing — the body text becomes a borderless textarea (`bg-surface` vs card's `bg-surface-hover`) with Save/Cancel buttons
  - **Delete**: Confirmation modal (`bg-overlay`) with "Delete Journal Entry?" prompt, Confirm (red) and Cancel buttons
  - Backend endpoints: `PUT /api/journal/{id}` (body only) and `DELETE /api/journal/{id}` with user ownership verification

### Transaction Semantics
- `Transaction` entity carries an `isInitial` boolean flag (default `false`)
- **Initial transactions**: Set to `true` only when recording holdings during `PortfolioService.createPortfolio()`. These are the baseline portfolio state, not trading events.
- **Non-initial transactions**: Regular `BUY`/`SELL` operations via `addHolding()`, `sellHolding()`, etc. (`isInitial=false`)
- The frontend (`processHourlyData` in `chartData.ts`) filters out `initial=true` transactions so they are **not rendered as buy/sell event pins** on the portfolio performance graph

### Demo Mode
- A user with `is_demo = true` (set manually in the `users` table) operates entirely from a session-only snapshot after login.
- On login, `LoginController` snapshots the demo user's real DB portfolio, transactions, journal entries, and watchlist into a `DemoSession` stored in the servlet `HttpSession` under `DEMO_SESSION`.
- All write endpoints route to `DemoSessionService` instead of the regular services, so buys, sells, journal edits, and watchlist changes exist only in memory for that session.
- **Trade limit**: Demo users are limited to **3 total buy/sell actions** per session. `DemoTradeLimitExceededException` is mapped to HTTP 403 by `GlobalExceptionHandler`.
- Price fetches in demo mode use `StockService` (may insert global `Stock` price rows) but **do not modify `TrackedStock.holderCount`** or the scheduler's ticker list.
- Logout invalidates the session and discards all demo changes; the DB demo user is untouched.
- Frontend: `Layout.tsx` fetches `/api/auth/me` to detect demo users and displays a top banner with remaining trades via `/api/portfolio/demo-status`. `Dashboard.tsx` consumes the demo context and shows the trade-limit error in buy/sell modals.
- New backend files: `model/DemoSession.java`, `service/DemoSessionService.java`, `service/DemoSessionResolver.java`, `exception/DemoTradeLimitExceededException.java`.
- New endpoints: `GET /api/auth/me`, `GET /api/portfolio/demo-status`.

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
| `src/main/java/.../exception/UnknownTickerException.java` | Thrown when a ticker symbol does not exist |
| `src/main/java/.../exception/PriceFetchException.java` | Thrown on transient API fetch failures |
| `src/main/java/.../exception/DemoTradeLimitExceededException.java` | Thrown when a demo user exceeds 3 buy/sell actions |
| `src/main/java/.../event/PriceFetchCompletedEvent.java` | Spring application event signaling an hourly price fetch completed |
| `src/main/java/.../event/PriceFetchEventService.java` | Manages `SseEmitter` subscriptions and broadcasts fetch-completed events |
| `src/main/java/.../controller/EventController.java` | Authenticated `GET /api/events` SSE endpoint |
| `src/main/java/.../controller/GlobalExceptionHandler.java` | Maps custom exceptions to HTTP 404/503/403 responses |
| `src/main/java/.../dto/PnLSummaryDTO.java` | P/L summary data transfer object |
| `src/main/java/.../service/PortfolioService.java` | Business logic incl. P/L calculation |
| `src/main/java/.../service/DemoSessionService.java` | Session-only business logic for demo users |
| `src/main/java/.../service/DemoSessionResolver.java` | Resolves demo state from the servlet session and current user |
| `src/main/java/.../model/DemoSession.java` | In-memory session snapshot for demo users |
| `src/main/java/.../service/EtfMetadataService.java` | ETF metadata loader (ETFs.csv → StockMetadata) |
| `src/main/java/.../service/NasdaqMetadataService.java` | Stock metadata loader with ETF fallback |
| `src/main/resources/data/ETFs.csv` | ETF metadata source (~1021 rows) |
| `src/main/resources/data/nasdaq_metadata.csv` | Stock metadata source (~6996 rows) |
| `src/main/java/.../model/Transaction.java` | Transaction entity with `isInitial` flag distinguishing portfolio creation from buys |
| `src/main/java/.../api/TiingoClient.java` | Tiingo API client; `INITIAL` stock data uses exact timestamp (not rounded) for graph accuracy |
| `frontend/.../components/PortfolioChart.tsx` | Exposes `PortfolioChartHandle` with `refresh()` via ref; chart refreshes on SSE `priceFetchCompleted` events |
| `frontend/.../components/NextUpdateTimer.tsx` | Dashboard header pill showing countdown to next scheduled price fetch |
| `frontend/.../components/Layout.tsx` | Sidebar layout; fetches `/api/auth/me` and shows demo mode banner |
| `frontend/.../hooks/useNextUpdate.ts` | Hook computing next market update; updates every minute synced to wall clock |
| `frontend/.../components/JournalPanel.tsx` | Exposes `JournalPanelHandle` with `scrollToEntry()` and `refreshEntries()` via ref; supports inline edit and delete with hover actions |
| `frontend/.../components/HoldingGraph.tsx` | D3 force graph for the Analysis page; tuned for subtle, user-controlled motion with weak attraction/repulsion and alpha-decayed sector grouping |
| `frontend/.../utils/dateUtils.ts` | Date helpers incl. `getNextMarketUpdate` and `formatNextUpdate` for the next-update timer |
| `frontend/.../utils/chartData.ts` | Processes portfolio history + transactions into chart data; filters out `initial` transactions |

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

