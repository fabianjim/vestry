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

## Contributing

Contributions are welcome. If you have any questions, ideas, or bug reports, feel free to open an issue or start a discussion.

## License

This project is licensed under the [MIT License](LICENSE).
