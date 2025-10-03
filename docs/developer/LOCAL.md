# Local Development Setup

This document provides step-by-step instructions for setting up Mosaic Life for local development.

## Prerequisites

- **Docker** and **Docker Compose** (recommended: Docker Desktop)
- **Node.js** 18+ with **pnpm** (for frontend development)
- **Python** 3.12+ (for backend development)
- **Git**

## Quick Start

1. **Clone and start services:**
   ```bash
   git clone <repository-url>
   cd mosaic-life-poc1
   docker compose -f infra/compose/docker-compose.yml up -d
   ```

2. **Access the application:**
   - **Frontend:** http://localhost:3001
   - **Backend API:** http://localhost:8080
   - **OpenSearch:** http://localhost:9200
   - **PostgreSQL:** localhost:15432
   - **Jaeger UI:** http://localhost:16686

## Architecture Overview

The local development setup includes:

- **Core API Service** (FastAPI): Backend API with auth, stories, media
- **Web App** (React + Vite): Frontend application  
- **PostgreSQL**: Primary database
- **OpenSearch**: Search and indexing
- **Localstack**: AWS services emulation (SNS/SQS/S3)
- **Jaeger**: Distributed tracing

## Development Workflow

### Frontend Development

1. **Navigate to web app:**
   ```bash
   cd apps/web
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```
   
   The dev server runs on http://localhost:5173 with hot reloading.

**Frontend Stack:**
- React 18 + TypeScript
- Vite (build tool)
- React Router (routing)
- TanStack Query (server state)
- Zustand (client state)

### Backend Development

1. **Navigate to core API:**
   ```bash
   cd services/core-api
   ```

2. **Create virtual environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # Linux/Mac
   # or venv\Scripts\activate  # Windows
   ```

3. **Install dependencies:**
   ```bash
   pip install -e .
   ```

4. **Run database migrations:**
   ```bash
   alembic upgrade head
   ```

5. **Start development server:**
   ```bash
   python -m app.main
   ```

**Backend Stack:**
- FastAPI + Uvicorn
- SQLAlchemy + Alembic (PostgreSQL)
- OpenTelemetry (tracing)
- Pydantic v2 (validation)

## Database Setup

The PostgreSQL database starts automatically with Docker Compose.

**Connection details:**
- Host: localhost
- Port: 15432
- Database: core
- Username: postgres
- Password: postgres

**Run migrations:**
```bash
cd services/core-api
alembic upgrade head
```

## Environment Configuration

### Default Environment Variables

The Docker Compose setup includes all required environment variables. For custom configuration, create `.env.local` files:

**Backend (.env.local in services/core-api/):**
```env
LOG_LEVEL=debug
DB_URL=postgresql+psycopg://postgres:postgres@localhost:15432/core
OPENSEARCH_URL=http://localhost:9200
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
```

**Frontend (.env.local in apps/web/):**
```env
VITE_API_BASE_URL=http://localhost:8080
```

## Services & Ports

| Service | Port | Purpose |
|---------|------|---------|
| Web App | 3001 | Frontend (production build) |
| Web Dev | 5173 | Frontend (dev server) |  
| Core API | 8080 | Backend API |
| PostgreSQL | 15432 | Database |
| OpenSearch | 9200 | Search engine |
| Localstack | 4566 | AWS services mock |
| Jaeger | 16686 | Tracing UI |

## Authentication Setup

**Current MVP:** Basic session-based auth (simplified for development)

**Target:** OIDC via Backend-for-Frontend (BFF) pattern with httpOnly cookies

For local development, authentication is currently stubbed. The target architecture will include:
- OIDC integration (Cognito/Authentik)
- Mock OIDC provider for local development
- Session management via BFF

## Plugin Development

**Note:** Plugin architecture is in development. Current MVP has integrated functionality.

**Future plugin development:**
```bash
# Plugin development compose
docker compose -f infra/compose/docker-compose.plugin.yml up

# Plugin UI served from http://localhost:7002/remoteEntry.js
# Plugin backend on dedicated port with registration
```

## Testing

### Frontend Tests
```bash
cd apps/web
npm run test          # Unit tests
npm run test:e2e      # Playwright E2E tests
```

### Backend Tests  
```bash
cd services/core-api
pytest                # Unit and integration tests
```

## Observability

### Tracing
- **Jaeger UI:** http://localhost:16686
- Traces automatically generated for API requests
- Frontend spans can be configured via OpenTelemetry Web

### Logs
- **Backend:** Structured JSON logs to stdout
- **Frontend:** Console logs in development

### Metrics
- **Backend:** Prometheus metrics at `/metrics` endpoint
- Health checks at `/health` and `/readiness`

## Common Issues

### Port Conflicts
If ports are in use, modify `docker-compose.yml` port mappings:
```yaml
ports:
  - "3002:80"  # Change 3001 to 3002
```

### Database Connection Issues
```bash
# Reset database
docker compose down
docker volume prune
docker compose up -d postgres
```

### OpenSearch Memory Issues
Increase Docker memory limit to 4GB+ or modify OpenSearch heap settings in `docker-compose.yml`.

## Development Commands

### Full Stack Reset
```bash
docker compose down
docker volume prune -f
docker compose up -d
```

### View Logs
```bash
docker compose logs -f core-api    # Backend logs
docker compose logs -f web         # Frontend logs
```

### Database Shell
```bash
docker exec -it <postgres-container> psql -U postgres -d core
```

## VS Code Setup

**Recommended Extensions:**
- Python
- TypeScript and JavaScript Language Features
- Prettier
- ESLint
- Docker
- REST Client

**Workspace Configuration:**
```json
{
  "python.defaultInterpreterPath": "./services/core-api/venv/bin/python",
  "typescript.preferences.includePackageJsonAutoImports": "auto"
}
```

## Next Steps

1. Review the [Project Architecture](/docs/project/PROJECT.md)
2. Check [API Design](/docs/architecture/API-DESIGN.md) for endpoint documentation
3. See [Coding Standards](/docs/developer/CODING-STANDARDS.md) for development guidelines

## Getting Help

- **GitHub Issues:** Report bugs and request features
- **Documentation:** `/docs` directory for architecture and design decisions
- **Code Comments:** Check inline documentation in source files
