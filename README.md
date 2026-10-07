# Vestry

An investment portfolio journaling app that helps users reflect on investment decisions.

[Visit](https://vestry.me)

Vestry is a portfolio journal for revisiting investment decisions over time. Record what you believe, expect, or feel about an investment, then return days, weeks, or months later to see how prices and your position have changed. Journal entries sit alongside portfolio history, connecting your original reasoning with what happened afterward.

Hourly market updates and price snapshots give your journal a financial context, connecting recorded trades, insights, market events, and later reflections to an evolving portfolio. Interactive charts bring those connections into view, while customizable analysis cards and filterable transaction history let you move from the portfolio’s overall performance to the details of an individual decision.

## Build

### Requirements

- Java 17
- Node.js 22.22+
- PostgreSQL
- A [Tiingo API token](https://api.tiingo.com/)

### Run locally

1. Create a PostgreSQL database.
2. Copy `services/api/application.properties.example` to `services/api/application-dev.properties` and fill in your database connection and Tiingo token.
3. From the repository root, run:

```bash
npm --prefix apps/web ci
make dev
```

The backend runs on port 8080 using the default `dev` profile.

### Optional AI briefings

In `services/api/application-dev.properties`, configure:

```properties
vestry.ai.enabled=true
```

Optional budget settings are provided where limits apply across the instance.

Provide your OpenAI API key before starting the app:

```bash
export OPENAI_API_KEY=your-api-key
```

OpenAI API usage is billed to your account.

## Development

Run commands from the repository root:

| Command | Purpose |
|---|---|
| `make dev` | Start the backend and frontend |
| `make dev-ai` | Start with sample briefing content; no AI calls |
| `make test` | Run backend and frontend tests |
| `make build` | Build both applications without running tests |
| `make eval-ai` | Run briefing evaluations with Promptfoo |

Backend tests use JUnit, Mockito, and H2; frontend tests use Vitest. Ordinary tests require no external database or API credentials.

## License

This project is licensed under the [MIT License](LICENSE).
