# Architecture Overview

Mosaic Life uses a simplified MVP architecture designed for rapid development.

## System Components

```
┌─────────────────┐     ┌─────────────────┐
│   React SPA     │────▶│   FastAPI       │
│   (Vite)        │     │   (Core API)    │
└─────────────────┘     └────────┬────────┘
                                 │
                        ┌────────▼────────┐
                        │   PostgreSQL    │
                        └─────────────────┘
```

## Tech Stack

### Frontend
- React 18 + TypeScript
- Vite (build tool)
- TanStack Query (server state)
- React Router (routing)

### Backend
- FastAPI + Uvicorn
- SQLAlchemy 2.x + Alembic
- Pydantic v2 (validation)
- PostgreSQL 16

### Infrastructure
- AWS EKS (Kubernetes)
- ArgoCD (GitOps)
- Helm (packaging)
- GitHub Actions (CI/CD)

## Key Patterns

- **Adapter Pattern**: External integrations abstracted behind interfaces
- **Repository Pattern**: Data access through SQLAlchemy models
- **OpenTelemetry**: Distributed tracing and observability
