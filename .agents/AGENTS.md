# Vestry — Agent Guide

Vestry is a portfolio journal for casual, reflective investors. It connects portfolio history (prices, holdings, transactions, P/L) with the reasoning behind decisions (journal entries, tags, observations). It favors calm reflection over trading speed. It is not a brokerage, trading platform, real-time feed or source of investment advice; never add language or behavior that implies those.

## Working rules

- Explore the affected code, callers and tests before changing anything. When this guide and the code disagree, trust the code. Report the discrepancy and fix this guide if the fact was stale. Never redefine intended behavior to match a bug.
- Routine, reversible work inside the requested objective needs no extra approval. Briefly state the plan (what, where, why, how verified) before editing. Ask first for scope expansion, unresolved product decisions, destructive data changes, spending, publishing or deployment.
- Make the smallest change that solves the task, using existing patterns and dependencies. Do not silently fix unrelated problems; report them.
- Do not edit `README.md` unless asked.
- Paid AI evaluations (`make eval-ai`, `./test-ai.sh`) need explicit approval for each run. Offline and mocked checks do not.
- Update this file only when you learn something significant for future agents. Keep it concise and free of contradictions. Do not log task history here.

## Layout and commands

- `apps/web`: React 19, TypeScript, Vite, Tailwind v4, React Query, Recharts, D3. Deployed on Vercel.
- `services/api`: Spring Boot 3.5, Java 17, root package `me.vestry`, layered `controller → service → repository`. Deployed to AWS Elastic Beanstalk, PostgreSQL on Supabase.
- Run from the root: `make dev`, `make test`, `make build`; or `docker compose up --build` (needs `.env` from `.env.example`). Backend: `./mvnw` in `services/api` (never a global `mvn`). Frontend: `npm test -- --run`, `npm run build`, `npm run lint` in `apps/web`.
- `make dev` needs the ignored `services/api/src/main/resources/application-dev.properties` (template: `services/api/application.properties.example`). `make dev-ai` serves a mocked briefing from Vite and makes no AI calls.
- Tests: JUnit 5, Mockito, H2 (backend) and Vitest (frontend). Add a regression test for bug fixes. Add only tests that protect a distinct behavior; avoid bloat.

## Invariants (high-risk; verify carefully when touched)

**Deployment**
- The browser calls relative `/api/*`, which Vercel rewrites to EB (`apps/web/vercel.json`). Keep every API route under `/api`.
- Keep `credentials: 'include'` and SSE `withCredentials`.
- The EB names `portfolio-monitor-api(-env)` and the `RDS_*` env vars are intentionally legacy. Do not rename them; that is an infrastructure migration.

**Auth**
- Custom session auth (BCrypt, servlet session). Everything except `/api/auth/**` requires login. CSRF is disabled.
- Treat changes to auth, cookies, CORS or proxying as security changes.

**Prices**
- Prices are hourly by design: intraday fetches on the hour 10:00–16:00 and an EOD fetch at 16:30, weekdays, `America/New_York`, skipping market holidays.
- SSE (`/api/events`) only signals "fetch completed, refresh". Do not add real-time prices or WebSockets.
- `TrackedStock` is a global ticker registry. `holderCount` drives scheduled fetching, and a ticker is removed at zero. Watchlist items are not tracked.

**Portfolio math**
- The transaction ledger, not current holdings, is the source of past ownership.
- P/L uses average cost per ticker, processed chronologically.
- History uses INTRADAY and INITIAL observations (not EOD), bucketed to the minute. A point is emitted only when every held ticker has a price.
- `PortfolioServiceHistoryTest`, `PortfolioServiceTransactionTest` and `PortfolioServicePnLTest` encode these rules. Don't simplify the algorithm without proving partial sells, full sells, re-buys and missing prices.

**Demo mode**
- Visitors get an in-memory copy of the demo account. It is instance-local, has a 30-minute sliding idle timeout, is limited to three trades, and may use negative transaction IDs.
- Visitor changes must never persist to the template account. Review `LoginController`, `DemoSessionResolver`, `DemoSessionStore` and `DemoSessionService` together.

**AI briefings**
- Daily dashboard briefings are generated with OpenAI.
- Preserve `AiBudgetService` reservation and settlement, the per-user/day duplicate prevention, and the content-tracing boundary in `BriefingTracing` (demo/eval runs only).

## Frontend conventions

- Use `services/api.ts` for requests, `services/queries.ts` for query keys/options, and `services/queryUpdates.ts` for invalidation. `Login.tsx` and `Portfolio.tsx` still call `fetch` directly; don't copy that.
- Put reusable computation in `utils/` and stateful logic in `hooks/`, so chart transformations stay testable.
- Design: dark-native and restrained.
  - Mostly achromatic with one cool-blue accent. Green and red are reserved for financial or status meaning.
  - Use the tokens in `src/index.css`, not hex values in components.
  - Font is Authentic Sans with weights `60/90/130/150` (body `90`; emphasize with `font-130`/`font-150`, not `font-bold`).
  - Motion should clarify state, never create urgency.
  - For dropdowns, reuse `GlassSelect` or the existing glass styling in `SectorBreakdown.tsx`/`TransactionHistory.tsx`.
- Do not add another charting library alongside Recharts and D3.
