# Vestry
An investment portfolio journaling app that helps users reflect on trading decisions.

[Visit Vestry](https://vestry.me)

## Project Structure


### Backend

`services/api/src/`

- `api/` — External API client for market data
- `config/` — Profile-gated scheduling configuration
- `controller/` — REST endpoints and global exception handling
- `dto/` — Data transfer objects
- `event/` — Spring events, SSE
- `exception/` — Custom exceptions
- `model/` — JPA entities
- `repository/` — Spring Data JPA repositories
- `security/` — Session-based authentication and CORS
- `service/` — Business logic, scheduled price fetching, metadata loaders, session handling

`services/api/src/main/resources/`

- `data/nasdaq_metadata.csv` — Stock metadata source
- `data/ETFs.csv` — ETF metadata source

### Frontend

`apps/web/src/`

- `pages/` — Route-level views
- `components/` — Reusable UI components and landing sections
- `services/` — API layer
- `types/` — TypeScript interfaces
- `utils/` — Helper functions
- `hooks/` — Shared React hooks

### Tooling & Deploy

- **Backend**: Java 17, Maven, Spring Boot 3.5.3
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS
- **Database**: PostgreSQL (dev/prod), H2 (tests)
- **Market Data**: Tiingo API

## Build

### Prerequisites

- Java 17
- Node.js
- A local PostgreSQL database
- A [Tiingo](https://api.tiingo.com/) API token

### Local Configuration

1. Copy `services/api/application.properties.example` to `services/api/application-dev.properties` and fill in your local database credentials and Tiingo token.
2. The Spring profile defaults to `dev`, which loads `application-dev.properties`. Make sure `SPRING_PROFILES_ACTIVE` is unset or set to `dev` for local development.

### Setup

1. Start PostgreSQL locally.
2. Complete the local configuration above and install frontend dependencies with `npm --prefix apps/web ci`.
3. From the repository root, run `make dev`.
4. Open `http://localhost:5173`. Vite proxies `/api` requests to `http://localhost:8080`.

Run `make help` to list commands for more .

## AI digest foundation

The backend includes a budgeted Responses API client, background-job ledger, and cached news retrieval.
Digest generation and account-scoped result storage are implemented. User-facing endpoints and dashboard
integration remain separate implementation steps. No AI calls run automatically.

AI is disabled by default. Configuration is server-only:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VESTRY_AI_ENABLED` | `false` | Explicit activation |
| `OPENAI_API_KEY` | empty | Dedicated provider project key |
| `VESTRY_AI_LIFETIME_BUDGET_MICROS` | `0` | Cumulative allowance; 1,000,000 microdollars = $1 |
| `VESTRY_AI_DAILY_BUDGET_MICROS` | `200000` | $0.20 daily allowance |
| `VESTRY_AI_DAILY_GENERATIONS` | `5` | Global daily attempt limit, including failed jobs |

Before activation, initialize the lock row once after Hibernate creates the AI tables:

```sql
INSERT INTO ai_budget (id, blocked) VALUES (1, false) ON CONFLICT (id) DO NOTHING;
```

A missing lock row prevents spending. Reservations, duplicate-request keys, and usage survive restarts
in `ai_budget`, `ai_generations`, and `ai_calls`; do not purge these tables to clear failures or reset usage.
Daily accounting uses America/New_York. The lifetime allowance never resets automatically.
All application instances must share this database and the same limits.

The client pins `gpt-4.1-mini-2025-04-14`, disables response storage, caps input/output, and reserves
conservative token costs before network access. It uses a 5-second connection timeout and a 30-second
read timeout with no application retries. Only one job runs at a time, with no queued backlog.
Uncertain calls retain their allowance; abandoned jobs retain their full reservation after five minutes.
Unexpected usage above a reservation blocks further spending pending operator review.
The ledger stores usage metadata, not journal text or prompts.

These controls cover this application's calls at the configured model rates, not unrelated use of the
provider account or future price changes. Recheck rates before enabling or changing models, and configure
provider billing separately. Tests mock the provider; they make no paid calls.

### News retrieval

`NewsService` runs within an existing authorized generation job. The caller reserves its `allowance`
alongside the digest allowance. It performs one required, low-context `web_search` call for up
to eight normalized stock symbols plus broad market news. The request contains only those public
symbols and dates, never journal text, account details, or position sizes.

The database cache is shared for identical symbol sets and New York calendar dates. Changing symbol
order/case does not trigger another search. Empty results, failures, and abandoned attempts are also
cached until the next date; no timer, visitor request, or startup hook currently initiates retrieval.
The service returns `DISABLED` without accessing the cache or provider when AI is unconfigured.

Up to four stories retain headlines, short summaries, publication dates, and HTTPS source links.
URLs must appear in provider-returned sources or citations; reported publication dates must be within
the last three days through the briefing date. Today is preferred, with dated recent context for quiet
days and weekends. Source dates and summaries are model-extracted, not independently fact-checked.
Malformed or ungrounded results are unavailable, distinct from an empty search. Coverage is intentionally
selective rather than exhaustive for every symbol. The digest retains validated source links; the UI must display them alongside the news paragraph.

Search reservations include the tool fee and fixed search-token block described in the
[OpenAI pricing documentation](https://developers.openai.com/api/docs/pricing).
Accounting conservatively adds that block to reported usage, even if usage already includes search
content. This can exhaust the application's allowance before the corresponding provider spend.
Live search quality and account/model compatibility remain to be checked during explicit activation;
all automated tests use mocked responses.

### Digest generation

`DigestContextService.capture()` runs on the authenticated request thread. It reads up to eight holdings,
saved quote timestamps, metadata, existing P/L calculations, and a bounded sample of the six latest journal
entries. It does not fetch new market prices. Missing quotes suppress valuation and unrealized metrics;
realized P/L remains available. The immutable snapshot excludes credentials and account identity from the
model input. For demo users it reads the persistent template, never a visitor's temporary session edits.

The integration sequence is: capture the snapshot, reserve `DigestService.allowance(snapshot)` through
`AiGenerationService.submit`, and call `DigestService.generate(jobId, snapshot)` inside that worker.
The allowance covers news plus the maximum bounded summary request. An unresolved paid news call stops
further calls in that job under the existing budget rules; cached unavailable news can be summarized
without claiming that a successful search found nothing.

The summary uses a strict JSON schema with no search tools. It targets 100–150 words and rejects responses
above 180 words, invalid citation IDs, malformed responses, and unsupported navigation destinations.
Questions point only to Dashboard, Holdings Analysis, or Journal. Sources are resolved from cached news,
never model-generated URLs. No repair/retry calls are made. Journal and news text remain untrusted input;
prompt safeguards and structural validation do not independently verify every generated claim.

`portfolio_digests` stores the validated result and capture/generation timestamps, not the raw context or
prompt. Results are private to the account; the demo template's result is shared by that demo account.
`DigestService.latest()` derives ownership from the authenticated principal and returns nothing when AI
is disabled. These services do not introduce automatic private-account generation. Endpoint authorization,
demo refresh triggers, dismissal, polling, and display belong to the dashboard integration step.
All tests use mocked model responses; editorial quality still needs the activation-stage live evaluation.

## Contributing

Contributions are welcome. If you have any questions, ideas, or bug reports, feel free to open an issue or start a discussion.

## License

This project is licensed under the [MIT License](LICENSE).
