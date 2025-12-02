# Local Development Setup

This guide provides detailed instructions for setting up a development environment.

## Prerequisites

### Required Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Docker | 24+ | Container runtime |
| Docker Compose | 2.20+ | Local orchestration |
| Node.js | 20+ | Frontend development |
| Python | 3.12+ | Backend development |
| uv | Latest | Python package manager |

### Optional Tools

- Just (command runner)
- VS Code with recommended extensions

## Full Stack Setup

```bash
# Start all services
docker compose -f infra/compose/docker-compose.yml up -d

# View logs
docker compose -f infra/compose/docker-compose.yml logs -f
```

## Frontend Only

```bash
cd apps/web
npm install
npm run dev
```

## Backend Only

```bash
cd services/core-api
uv sync
uv run alembic upgrade head
uv run python -m app.main
```

## Database Access

```bash
docker compose -f infra/compose/docker-compose.yml exec postgres psql -U postgres -d core
```
