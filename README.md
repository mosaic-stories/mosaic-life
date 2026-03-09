# Mosaic Life

**Preserve the complete story of a life — told by everyone who lived it.**

Mosaic Life is an open-source platform where families and friends collectively capture, connect, and preserve memories of the people they love. Like tiles in a mosaic, each person sees a different facet of someone's life. When those perspectives come together, they create something far richer than any single viewpoint.

**Live platform:** [mosaiclife.me](https://mosaiclife.me)

## Why Mosaic Life?

When someone passes away, the memories scattered across family and friends begin to fade. The little details — inside jokes, Sunday morning routines, the way they laughed — exist only in the minds of the people who were there. Mosaic Life gives those memories a permanent home.

### Key Features

- **Collaborative storytelling** — Multiple contributors add their own memories and perspectives to build a complete portrait
- **Rich story editor** — TipTap-powered editor with Markdown support for writing detailed, formatted stories
- **AI memory partner** — AI assistants help interview contributors, notice connections between stories, and surface patterns across memories
- **Privacy-first** — Full control over who can contribute and what gets shared; stories are treated with dignity and respect
- **Self-hostable** — Fully open-source (GPLv3); run your own instance or join the hosted platform
- **Graph-connected memories** — Stories link together through people, places, and events to reveal the full picture

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript (strict), Vite, TanStack Query, Zustand, Tailwind CSS, Radix UI |
| **Backend** | Python, FastAPI, Pydantic v2, SQLAlchemy 2.x |
| **Database** | PostgreSQL 16 + pgvector |
| **Graph DB** | Neptune (TinkerPop Gremlin) |
| **AI** | LiteLLM proxy (AWS Bedrock models) |
| **Infrastructure** | Docker Compose (local), Kubernetes + ArgoCD (production), AWS EKS |
| **Observability** | OpenTelemetry, Jaeger, Prometheus |
| **CI/CD** | GitHub Actions |

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Node.js](https://nodejs.org/) (v18+)
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [just](https://github.com/casey/just) (command runner — optional but recommended)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/mosaic-stories/mosaic-life.git
cd mosaic-life

# Start all services (PostgreSQL, API, frontend, Jaeger, etc.)
docker compose -f infra/compose/docker-compose.yml up -d

# Run database migrations
cd services/core-api
uv sync
uv run alembic upgrade head
cd ../..

# Seed sample data (optional)
just seed

# Start the frontend dev server
cd apps/web
npm install
npm run dev
```

The app is now running:

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8080 |
| API Docs (Swagger) | http://localhost:8080/docs |
| Jaeger (tracing) | http://localhost:16686 |
| PostgreSQL | localhost:15432 (user: `postgres`, password: `postgres`, db: `core`) |

Or use `just` for a streamlined setup:

```bash
just setup    # Start services, run migrations, seed data
just dev      # Start the frontend dev server
```

### Running with Docker Compose Only

If you prefer to run everything in containers without installing Node.js or uv locally:

```bash
docker compose -f infra/compose/docker-compose.yml up -d
```

This starts the full stack including the frontend, backend, database, and supporting services.

## Development

### Frontend

```bash
cd apps/web
npm install
npm run dev           # Dev server with HMR (localhost:5173)
npm run build         # Production build
npm run lint          # ESLint
npm run test          # Unit tests (Vitest)
npm run test:e2e      # E2E tests (Playwright)
```

### Backend

```bash
cd services/core-api
uv sync               # Install dependencies
uv run python -m app.main    # Start dev server (localhost:8080)
uv run pytest          # Run tests
```

### Database

```bash
# Connect to local PostgreSQL
docker compose -f infra/compose/docker-compose.yml exec postgres psql -U postgres -d core

# Create a new migration
cd services/core-api
uv run alembic revision --autogenerate -m "add new table"

# Apply migrations
uv run alembic upgrade head
```

## Build & Validate

Before committing changes, run validation to ensure code quality:

```bash
# Validate everything
just validate-all

# Backend only (ruff lint + format + mypy type checking)
just validate-backend

# Frontend only (ESLint + TypeScript checks)
just validate-frontend

# Auto-fix backend lint issues
just lint-fix-backend
```

### Building Docker Images

```bash
just build-web           # Build frontend image
just build-core-api      # Build backend image
```

## Project Structure

```
├── apps/
│   ├── web/              # React + Vite frontend
│   └── docs/             # MkDocs documentation site
├── services/
│   └── core-api/         # FastAPI backend
├── infra/
│   ├── compose/          # Docker Compose for local dev
│   ├── helm/             # Kubernetes Helm charts
│   └── cdk/              # AWS CDK infrastructure
├── docs/                 # Architecture & developer docs
├── packages/
│   └── shared-types/     # Shared TypeScript types
└── justfile              # Build automation commands
```

## Documentation

Detailed documentation lives in the [docs/](docs/) directory:

- [Architecture Overview](docs/architecture/MVP-SIMPLIFIED-ARCHITECTURE.md)
- [Coding Standards](docs/developer/CODING-STANDARDS.md)
- [Local Development Guide](docs/developer/LOCAL.md)

## Contributing

Mosaic Life is open-source under the [GPLv3 license](LICENSE). Contributions are welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/your-feature`)
3. Make your changes and validate (`just validate-all`)
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, etc.)
5. Open a Pull Request

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).

---

<p align="center">
  Built with love in memory of Karen Hewitt.
  <br><br>
  <a href="https://buymeacoffee.com/mosaiclife">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" width="200">
  </a>
</p>
