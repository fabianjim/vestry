# Vestry
An investment portfolio journaling app that helps users reflect on trading decisions.

[Visit Vestry](https://vestry.me)

## Project Structure

Vestry is split into a Spring Boot backend and a React + Vite frontend.

### Backend

`vestry/src/`

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

`vestry/src/main/resources/`

- `data/nasdaq_metadata.csv` — Stock metadata source
- `data/ETFs.csv` — ETF metadata source

### Frontend

`frontend/vite-project/src/`

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
- **CI/CD**: GitHub Actions for AWS Elastic Beanstalk backend deployment; Vercel frontend deploys automatically

## Build

### Prerequisites

- Java 17
- Node.js
- A local PostgreSQL database
- A [Tiingo](https://api.tiingo.com/) API token

### Local Configuration

1. Copy `application.properties.example` to `application-dev.properties` and fill in your local database credentials and Tiingo token.
2. The active Spring profile is selected in `application.properties`. For local development, use the `dev` profile so `application-dev.properties` is loaded.

### Backend

```bash
./mvnw spring-boot:run   # Run with the dev profile
./mvnw clean package -DskipTests   # Build the deploy JAR
```

### Frontend

```bash
cd frontend/vite-project
npm install
npm run dev      # Dev server on http://localhost:5173
npm run build    # Type-check and build
npm run lint     # Run ESLint
```

### Full Stack Local

1. Start PostgreSQL locally.
2. Run `./mvnw spring-boot:run` from the project root.
3. In another terminal, run `npm run dev` from `frontend/vite-project`.
4. The Vite dev server proxies `/api` requests to `http://localhost:8080`.

## Contributing

Contributions are welcome. If you have any questions, ideas, or bug reports, feel free to open an issue or start a discussion.

## License

This project is licensed under the [MIT License](LICENSE).
