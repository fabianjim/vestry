# Vestry

An investment portfolio journaling app that helps users reflect on investment decisions.

[Visit](https://vestry.me)

Vestry is a portfolio journal for revisiting investment decisions over time. Record what you believe, expect, or feel about an investment, then return days, weeks, or months later to see how prices and your position have changed. Journal entries sit alongside portfolio history, connecting your original reasoning with what happened afterward.

Hourly market updates and price snapshots give your journal a financial context, connecting recorded trades, insights, market events, and later reflections to an evolving portfolio. Interactive charts bring those connections into view, while customizable analysis cards and filterable transaction history let you move from the portfolio’s overall performance to the details of an individual decision.

## Build

### Requirements

- A [Tiingo API token](https://api.tiingo.com/)
- Docker with Compose

### Run locally

1. Start Docker and copy `.env.example` to `.env` in the repository root.
2. Fill in `TIINGO_API_TOKEN`.
3. For optional AI briefings, set `VESTRY_AI_ENABLED` to `true` and fill in `OPENAI_API_KEY`. OpenAI API usage is billed to your account.
4. From the repository root, run:

   ```bash
   docker compose up --build
   ```

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
