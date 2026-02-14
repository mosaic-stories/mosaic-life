# Documentation Service Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deploy a versioned documentation site (MkDocs + Material Theme) with auto-generated Python/TypeScript API docs and OpenAPI integration, accessible at `docs.mosaiclife.me` (prod) and `stage-docs.mosaiclife.me` (staging).

**Architecture:** Static site built with MkDocs, served by Nginx. TypeDoc generates Markdown from TypeScript. OpenAPI spec generated from FastAPI at build time. Versioning via `mike` plugin triggered by Git tags. Deployed to EKS via ArgoCD as separate application (`docs-prod` / `docs-staging`).

**Tech Stack:** MkDocs, Material for MkDocs, mkdocstrings, TypeDoc, mike (versioning), Nginx, Docker, Helm, ArgoCD, GitHub Actions

---

## Phase 1: Application Structure

### Task 1: Create Documentation App Directory Structure

Create the base directory structure for the documentation application.

**Files:**
- Create: `apps/docs/docs/index.md`
- Create: `apps/docs/docs/getting-started/installation.md`
- Create: `apps/docs/docs/getting-started/first-steps.md`
- Create: `apps/docs/docs/user-guide/creating-stories.md`
- Create: `apps/docs/docs/user-guide/sharing-memories.md`
- Create: `apps/docs/docs/developer-guide/local-setup.md`
- Create: `apps/docs/docs/developer-guide/architecture.md`
- Create: `apps/docs/docs/developer-guide/contributing.md`
- Create: `apps/docs/docs/api/overview.md`
- Create: `apps/docs/docs/api/openapi.md`
- Create: `apps/docs/docs/changelog.md`

**Step 1: Create directory structure and placeholder files**

```bash
mkdir -p apps/docs/docs/{getting-started,user-guide,developer-guide,api,reference/python,reference/typescript}
mkdir -p apps/docs/scripts
```

**Step 2: Create index.md**

Create `apps/docs/docs/index.md`:

```markdown
# Welcome to Mosaic Life Documentation

Mosaic Life is a memorial stories platform that allows you to create, share, and preserve life stories and memories.

## Getting Started

- [Installation](getting-started/installation.md) - Set up your development environment
- [First Steps](getting-started/first-steps.md) - Create your first legacy

## For Users

- [Creating Stories](user-guide/creating-stories.md) - Write and edit stories
- [Sharing Memories](user-guide/sharing-memories.md) - Invite family and friends

## For Developers

- [Local Setup](developer-guide/local-setup.md) - Run Mosaic Life locally
- [Architecture](developer-guide/architecture.md) - System design overview
- [Contributing](developer-guide/contributing.md) - How to contribute

## API Reference

- [API Overview](api/overview.md) - REST API introduction
- [OpenAPI Specification](api/openapi.md) - Interactive API docs

## Code Reference

- [Python API](reference/python/index.md) - Backend code documentation
- [TypeScript API](reference/typescript/index.md) - Frontend code documentation
```

**Step 3: Create getting-started placeholders**

Create `apps/docs/docs/getting-started/installation.md`:

```markdown
# Installation

This guide covers setting up Mosaic Life for local development.

## Prerequisites

- Docker and Docker Compose
- Node.js 20+
- Python 3.12+
- uv (Python package manager)

## Quick Start

1. Clone the repository:

    ```bash
    git clone https://github.com/mosaic-stories/mosaic-life.git
    cd mosaic-life
    ```

2. Start all services:

    ```bash
    docker compose -f infra/compose/docker-compose.yml up -d
    ```

3. Access the application:

    - Frontend: http://localhost:5173
    - API: http://localhost:8080
    - API Docs: http://localhost:8080/docs
```

Create `apps/docs/docs/getting-started/first-steps.md`:

```markdown
# First Steps

After installation, follow these steps to get started with Mosaic Life.

## Create an Account

1. Navigate to http://localhost:5173
2. Click "Sign in with Google"
3. Complete the OAuth flow

## Create Your First Legacy

A legacy is a collection of stories about a person's life.

1. Click "Create Legacy" from the dashboard
2. Enter the person's name and details
3. Add your first story

## Next Steps

- Learn about [Creating Stories](../user-guide/creating-stories.md)
- Invite family members to [Share Memories](../user-guide/sharing-memories.md)
```

**Step 4: Create user-guide placeholders**

Create `apps/docs/docs/user-guide/creating-stories.md`:

```markdown
# Creating Stories

Stories are the heart of Mosaic Life. Each story captures a memory, moment, or milestone.

## Writing a Story

1. Open a legacy
2. Click "Add Story"
3. Enter a title and start writing

## Using the Editor

The story editor supports rich text formatting:

- **Bold** and *italic* text
- Headers and lists
- Images and media
- Links

## Saving and Publishing

Stories are saved automatically as drafts. When ready, click "Publish" to share with legacy members.
```

Create `apps/docs/docs/user-guide/sharing-memories.md`:

```markdown
# Sharing Memories

Mosaic Life is designed for collaborative storytelling. Invite family and friends to contribute.

## Inviting Members

1. Open a legacy
2. Click "Members"
3. Enter email addresses to invite

## Member Roles

- **Owner**: Full control, can delete legacy
- **Editor**: Can add and edit stories
- **Viewer**: Read-only access

## Privacy Settings

Control who can see your legacy:

- **Private**: Only invited members
- **Family**: Extended family with link
- **Public**: Anyone with the link
```

**Step 5: Create developer-guide placeholders**

Create `apps/docs/docs/developer-guide/local-setup.md`:

```markdown
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
```

Create `apps/docs/docs/developer-guide/architecture.md`:

```markdown
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
```

Create `apps/docs/docs/developer-guide/contributing.md`:

```markdown
# Contributing to Mosaic Life

We welcome contributions! This guide explains how to contribute effectively.

## Code of Conduct

Be respectful and inclusive. We're building something meaningful together.

## Development Workflow

1. Fork the repository
2. Create a feature branch from `develop`
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## Commit Messages

Use Conventional Commits format:

```
feat: add story search functionality
fix: resolve date picker timezone issue
docs: update API authentication guide
chore: upgrade dependencies
```

## Pull Request Guidelines

- Target < 400 lines of code
- Include tests for new features
- Update documentation as needed
- Link to related GitHub issues

## Running Tests

```bash
# Frontend
cd apps/web
npm run test

# Backend
cd services/core-api
uv run pytest
```

## Code Style

- **TypeScript**: ESLint + Prettier
- **Python**: Ruff + MyPy (strict)

Always run `just validate-backend` before committing Python changes.
```

**Step 6: Create API documentation placeholders**

Create `apps/docs/docs/api/overview.md`:

```markdown
# API Overview

The Mosaic Life API is a RESTful HTTP API built with FastAPI.

## Base URL

| Environment | URL |
|-------------|-----|
| Production | `https://api.mosaiclife.me` |
| Staging | `https://stage-api.mosaiclife.me` |
| Local | `http://localhost:8080` |

## Authentication

The API uses session-based authentication with Google OAuth.

1. Initiate login: `GET /auth/login`
2. Complete OAuth flow
3. Session cookie set automatically

## Request Format

```bash
curl -X GET https://api.mosaiclife.me/legacies \
  -H "Content-Type: application/json" \
  --cookie "session=..."
```

## Response Format

All responses follow this structure:

```json
{
  "data": { ... },
  "meta": {
    "request_id": "abc123"
  }
}
```

## Error Handling

Errors return appropriate HTTP status codes:

| Code | Meaning |
|------|---------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Not logged in |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Error - Server issue |

## Rate Limiting

API requests are limited to 100 requests per minute per user.
```

Create `apps/docs/docs/api/openapi.md`:

```markdown
# OpenAPI Specification

Interactive API documentation powered by the OpenAPI specification.

## Swagger UI

<swagger-ui src="openapi.json"/>

!!! note "Interactive Documentation"
    The embedded API documentation above allows you to explore endpoints,
    view request/response schemas, and test API calls directly.

## Download Specification

- [OpenAPI JSON](openapi.json) - Machine-readable specification
- [OpenAPI YAML](openapi.yaml) - Human-readable specification

## Using the API

1. Authenticate via `/auth/login`
2. Use the session cookie for subsequent requests
3. Explore endpoints in the documentation above
```

**Step 7: Create changelog placeholder**

Create `apps/docs/docs/changelog.md`:

```markdown
# Changelog

All notable changes to Mosaic Life are documented here.

## [Unreleased]

### Added
- Documentation site with versioned docs
- OpenAPI specification integration
- Auto-generated Python and TypeScript API references

### Changed
- N/A

### Fixed
- N/A

---

## Version History

Versions are tagged in Git and correspond to documentation versions in the version selector above.
```

**Step 8: Create reference index files**

Create `apps/docs/docs/reference/python/index.md`:

```markdown
# Python API Reference

Auto-generated documentation for the Mosaic Life backend (FastAPI).

## Modules

::: app.main
    options:
      show_root_heading: true
      show_source: false

::: app.config
    options:
      show_root_heading: true
      show_source: false

::: app.models
    options:
      show_root_heading: true
      show_source: false

::: app.schemas
    options:
      show_root_heading: true
      show_source: false

::: app.routes
    options:
      show_root_heading: true
      show_source: false
```

Create `apps/docs/docs/reference/typescript/index.md`:

```markdown
# TypeScript API Reference

Auto-generated documentation for the Mosaic Life frontend (React).

<!-- TypeDoc-generated content will be inserted here during build -->

!!! info "Build-time Generation"
    This documentation is generated from TypeScript source code during the docs build process.
```

**Step 9: Commit the directory structure**

```bash
git add apps/docs/docs/
git commit -m "feat(docs): add documentation content structure with placeholders"
```

---

### Task 2: Create MkDocs Configuration

Configure MkDocs with Material theme, plugins, and navigation.

**Files:**
- Create: `apps/docs/mkdocs.yml`

**Step 1: Create mkdocs.yml configuration**

Create `apps/docs/mkdocs.yml`:

```yaml
site_name: Mosaic Life Documentation
site_url: https://docs.mosaiclife.me
site_description: Documentation for the Mosaic Life memorial stories platform
site_author: Mosaic Stories

repo_name: mosaic-stories/mosaic-life
repo_url: https://github.com/mosaic-stories/mosaic-life

copyright: Copyright &copy; 2024-2025 Mosaic Stories

theme:
  name: material
  custom_dir: overrides
  language: en

  palette:
    # Light mode
    - media: "(prefers-color-scheme: light)"
      scheme: default
      primary: indigo
      accent: indigo
      toggle:
        icon: material/brightness-7
        name: Switch to dark mode
    # Dark mode
    - media: "(prefers-color-scheme: dark)"
      scheme: slate
      primary: indigo
      accent: indigo
      toggle:
        icon: material/brightness-4
        name: Switch to light mode

  features:
    - navigation.instant
    - navigation.tracking
    - navigation.tabs
    - navigation.tabs.sticky
    - navigation.sections
    - navigation.expand
    - navigation.top
    - navigation.footer
    - toc.follow
    - search.suggest
    - search.highlight
    - content.code.copy
    - content.code.annotate
    - content.tabs.link

  icon:
    repo: fontawesome/brands/github

plugins:
  - search:
      lang: en
  - mkdocstrings:
      default_handler: python
      handlers:
        python:
          paths: [../../services/core-api]
          options:
            docstring_style: google
            show_source: true
            show_root_heading: true
            show_root_toc_entry: true
            show_symbol_type_heading: true
            show_symbol_type_toc: true
            members_order: source
            separate_signature: true
            unwrap_annotated: true
            merge_init_into_class: true

markdown_extensions:
  - admonition
  - pymdownx.details
  - pymdownx.superfences:
      custom_fences:
        - name: mermaid
          class: mermaid
          format: !!python/name:pymdownx.superfences.fence_code_format
  - pymdownx.highlight:
      anchor_linenums: true
      line_spans: __span
      pygments_lang_class: true
  - pymdownx.inlinehilite
  - pymdownx.snippets
  - pymdownx.tabbed:
      alternate_style: true
  - pymdownx.tasklist:
      custom_checkbox: true
  - pymdownx.emoji:
      emoji_index: !!python/name:material.extensions.emoji.twemoji
      emoji_generator: !!python/name:material.extensions.emoji.to_svg
  - attr_list
  - md_in_html
  - tables
  - toc:
      permalink: true
      toc_depth: 3

nav:
  - Home: index.md
  - Getting Started:
    - Installation: getting-started/installation.md
    - First Steps: getting-started/first-steps.md
  - User Guide:
    - Creating Stories: user-guide/creating-stories.md
    - Sharing Memories: user-guide/sharing-memories.md
  - Developer Guide:
    - Local Setup: developer-guide/local-setup.md
    - Architecture: developer-guide/architecture.md
    - Contributing: developer-guide/contributing.md
  - API Reference:
    - Overview: api/overview.md
    - OpenAPI: api/openapi.md
  - Code Reference:
    - Python: reference/python/index.md
    - TypeScript: reference/typescript/index.md
  - Changelog: changelog.md

extra:
  version:
    provider: mike
  social:
    - icon: fontawesome/brands/github
      link: https://github.com/mosaic-stories/mosaic-life
  generator: false
```

**Step 2: Create theme overrides directory**

```bash
mkdir -p apps/docs/overrides
touch apps/docs/overrides/.gitkeep
```

**Step 3: Verify configuration syntax**

We'll verify this works after installing dependencies in the next task.

**Step 4: Commit**

```bash
git add apps/docs/mkdocs.yml apps/docs/overrides/
git commit -m "feat(docs): add MkDocs configuration with Material theme"
```

---

### Task 3: Create Python Dependencies

Set up Python dependencies for MkDocs and documentation generation.

**Files:**
- Create: `apps/docs/pyproject.toml`

**Step 1: Create pyproject.toml**

Create `apps/docs/pyproject.toml`:

```toml
[project]
name = "mosaic-docs"
version = "0.1.0"
description = "Mosaic Life Documentation"
requires-python = ">=3.12"

dependencies = [
    "mkdocs>=1.6.0",
    "mkdocs-material>=9.5.0",
    "mkdocstrings[python]>=0.26.0",
    "mike>=2.1.0",
    "pymdown-extensions>=10.0",
]

[project.optional-dependencies]
dev = [
    "mkdocs-swagger-ui-tag>=0.6.0",
]

[build-system]
requires = ["setuptools>=61.0"]
build-backend = "setuptools.build_meta"
```

**Step 2: Test dependency installation**

```bash
cd apps/docs
uv sync
```

Expected: Dependencies install successfully.

**Step 3: Verify MkDocs runs**

```bash
cd apps/docs
uv run mkdocs --version
```

Expected: `mkdocs, version 1.6.x`

**Step 4: Commit**

```bash
git add apps/docs/pyproject.toml
git commit -m "feat(docs): add Python dependencies for MkDocs"
```

---

### Task 4: Create TypeDoc Configuration

Set up TypeDoc for generating TypeScript documentation.

**Files:**
- Create: `apps/docs/package.json`
- Create: `apps/docs/typedoc.json`

**Step 1: Create package.json**

Create `apps/docs/package.json`:

```json
{
  "name": "mosaic-docs",
  "version": "0.1.0",
  "private": true,
  "description": "Mosaic Life Documentation",
  "scripts": {
    "generate:typedoc": "typedoc",
    "generate:typedoc:web": "typedoc --options typedoc-web.json",
    "generate:typedoc:shared": "typedoc --options typedoc-shared.json"
  },
  "devDependencies": {
    "typedoc": "^0.26.0",
    "typedoc-plugin-markdown": "^4.2.0"
  }
}
```

**Step 2: Create typedoc.json for web app**

Create `apps/docs/typedoc-web.json`:

```json
{
  "$schema": "https://typedoc.org/schema.json",
  "entryPoints": ["../web/src"],
  "entryPointStrategy": "expand",
  "out": "docs/reference/typescript/web",
  "plugin": ["typedoc-plugin-markdown"],
  "outputFileStrategy": "modules",
  "excludePrivate": true,
  "excludeProtected": true,
  "excludeInternal": true,
  "readme": "none",
  "githubPages": false,
  "hideBreadcrumbs": true,
  "hidePageHeader": true
}
```

**Step 3: Create typedoc.json for shared packages**

Create `apps/docs/typedoc-shared.json`:

```json
{
  "$schema": "https://typedoc.org/schema.json",
  "entryPoints": ["../../packages/shared-types/src"],
  "entryPointStrategy": "expand",
  "out": "docs/reference/typescript/shared",
  "plugin": ["typedoc-plugin-markdown"],
  "outputFileStrategy": "modules",
  "excludePrivate": true,
  "excludeProtected": true,
  "excludeInternal": true,
  "readme": "none",
  "githubPages": false,
  "hideBreadcrumbs": true,
  "hidePageHeader": true
}
```

**Step 4: Install dependencies**

```bash
cd apps/docs
npm install
```

**Step 5: Commit**

```bash
git add apps/docs/package.json apps/docs/typedoc-web.json apps/docs/typedoc-shared.json
git commit -m "feat(docs): add TypeDoc configuration for TypeScript documentation"
```

---

### Task 5: Create Build Scripts

Create scripts for generating OpenAPI spec, TypeDoc, and building the docs.

**Files:**
- Create: `apps/docs/scripts/generate-openapi.sh`
- Create: `apps/docs/scripts/generate-typedoc.sh`
- Create: `apps/docs/scripts/build.sh`

**Step 1: Create OpenAPI generation script**

Create `apps/docs/scripts/generate-openapi.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_DIR="$(dirname "$SCRIPT_DIR")"
CORE_API_DIR="$DOCS_DIR/../../services/core-api"
OUTPUT_DIR="$DOCS_DIR/docs/api"

echo "[docs] Generating OpenAPI specification..."

cd "$CORE_API_DIR"

# Generate OpenAPI JSON using FastAPI's built-in export
uv run python -c "
from app.main import app
import json

openapi_schema = app.openapi()
with open('$OUTPUT_DIR/openapi.json', 'w') as f:
    json.dump(openapi_schema, f, indent=2)

print('[docs] OpenAPI JSON written to $OUTPUT_DIR/openapi.json')
"

echo "[docs] OpenAPI generation complete"
```

**Step 2: Create TypeDoc generation script**

Create `apps/docs/scripts/generate-typedoc.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_DIR="$(dirname "$SCRIPT_DIR")"

echo "[docs] Generating TypeScript documentation..."

cd "$DOCS_DIR"

# Generate TypeDoc for web app
echo "[docs] Generating TypeDoc for apps/web..."
npm run generate:typedoc:web || echo "[docs] Warning: TypeDoc web generation had issues"

# Generate TypeDoc for shared packages
echo "[docs] Generating TypeDoc for packages/shared-types..."
npm run generate:typedoc:shared || echo "[docs] Warning: TypeDoc shared generation had issues"

echo "[docs] TypeDoc generation complete"
```

**Step 3: Create main build script**

Create `apps/docs/scripts/build.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_DIR="$(dirname "$SCRIPT_DIR")"

echo "[docs] Starting documentation build..."

cd "$DOCS_DIR"

# Step 1: Generate OpenAPI specification
echo "[docs] Step 1/4: Generating OpenAPI spec..."
bash "$SCRIPT_DIR/generate-openapi.sh"

# Step 2: Generate TypeScript documentation
echo "[docs] Step 2/4: Generating TypeDoc..."
bash "$SCRIPT_DIR/generate-typedoc.sh"

# Step 3: Install Python dependencies
echo "[docs] Step 3/4: Installing Python dependencies..."
uv sync

# Step 4: Build MkDocs site
echo "[docs] Step 4/4: Building MkDocs site..."
uv run mkdocs build --strict

echo "[docs] Documentation build complete!"
echo "[docs] Output: $DOCS_DIR/site/"
```

**Step 4: Make scripts executable**

```bash
chmod +x apps/docs/scripts/*.sh
```

**Step 5: Commit**

```bash
git add apps/docs/scripts/
git commit -m "feat(docs): add build scripts for OpenAPI, TypeDoc, and MkDocs"
```

---

### Task 6: Create Dockerfile

Create a multi-stage Dockerfile for building and serving documentation.

**Files:**
- Create: `apps/docs/Dockerfile`
- Create: `apps/docs/nginx.conf`

**Step 1: Create Dockerfile**

Create `apps/docs/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1

# ==============================================================================
# Stage 1: Build environment
# ==============================================================================
FROM python:3.12-slim AS builder

WORKDIR /build

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js for TypeDoc
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy documentation source
COPY apps/docs/ /build/docs/
COPY services/core-api/ /build/services/core-api/
COPY apps/web/ /build/apps/web/
COPY packages/ /build/packages/

WORKDIR /build/docs

# Install Python dependencies
RUN uv sync

# Install Node dependencies
RUN npm install

# Generate OpenAPI (requires core-api dependencies)
WORKDIR /build/services/core-api
RUN uv sync

WORKDIR /build/docs

# Run build script (generates OpenAPI, TypeDoc, and builds MkDocs)
RUN bash scripts/build.sh

# ==============================================================================
# Stage 2: Runtime (nginx)
# ==============================================================================
FROM nginx:1.27-alpine AS runtime

# Copy built documentation
COPY --from=builder /build/docs/site /usr/share/nginx/html

# Copy nginx configuration
COPY apps/docs/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
```

**Step 2: Create nginx.conf**

Create `apps/docs/nginx.conf`:

```nginx
server {
    listen 8080;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml application/atom+xml image/svg+xml;

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }

    # Serve static files with caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Handle SPA-style routing for MkDocs
    location / {
        try_files $uri $uri/ $uri.html =404;
    }

    # Error pages
    error_page 404 /404.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
```

**Step 3: Commit**

```bash
git add apps/docs/Dockerfile apps/docs/nginx.conf
git commit -m "feat(docs): add Dockerfile and nginx configuration"
```

---

## Phase 2: Docker Compose Integration

### Task 7: Add Documentation Service to Docker Compose

Add the docs service to the local development Docker Compose configuration.

**Files:**
- Modify: `infra/compose/docker-compose.yml`

**Step 1: Add docs service to docker-compose.yml**

Find the `services:` block in `infra/compose/docker-compose.yml` and add the docs service after the existing services:

```yaml
  docs:
    build:
      context: ../..
      dockerfile: apps/docs/Dockerfile
    ports:
      - "8000:8080"
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8080/health"]
      interval: 30s
      timeout: 3s
      retries: 3
    profiles:
      - docs
```

**Step 2: Test docs service builds**

```bash
docker compose -f infra/compose/docker-compose.yml --profile docs build docs
```

Expected: Build completes successfully.

**Step 3: Test docs service runs**

```bash
docker compose -f infra/compose/docker-compose.yml --profile docs up docs -d
curl http://localhost:8000/health
```

Expected: Returns "healthy"

**Step 4: Stop test service**

```bash
docker compose -f infra/compose/docker-compose.yml --profile docs down
```

**Step 5: Commit**

```bash
git add infra/compose/docker-compose.yml
git commit -m "feat(compose): add docs service to docker-compose"
```

---

## Phase 3: Helm Chart

### Task 8: Create Helm Chart Structure

Create the Helm chart for deploying the documentation service.

**Files:**
- Create: `infra/helm/docs/Chart.yaml`
- Create: `infra/helm/docs/values.yaml`
- Create: `infra/helm/docs/templates/_helpers.tpl`

**Step 1: Create Chart.yaml**

Create `infra/helm/docs/Chart.yaml`:

```yaml
apiVersion: v2
name: docs
description: Mosaic Life Documentation Site
type: application
version: 0.1.0
appVersion: "0.1.0"
maintainers:
  - name: Mosaic Stories
    url: https://github.com/mosaic-stories
```

**Step 2: Create values.yaml**

Create `infra/helm/docs/values.yaml`:

```yaml
# Replica configuration
replicaCount: 2

# Image configuration
image:
  repository: 033691785857.dkr.ecr.us-east-1.amazonaws.com/mosaic-life/docs
  pullPolicy: IfNotPresent
  tag: "latest"

# Service configuration
service:
  type: ClusterIP
  port: 80
  targetPort: 8080

# Ingress configuration
ingress:
  enabled: true
  className: alb
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS": 443}]'
    alb.ingress.kubernetes.io/ssl-redirect: "443"
    alb.ingress.kubernetes.io/group.name: mosaic-life-main
    alb.ingress.kubernetes.io/group.order: "30"
    alb.ingress.kubernetes.io/healthcheck-path: /health
    alb.ingress.kubernetes.io/healthcheck-interval-seconds: "15"
    alb.ingress.kubernetes.io/healthcheck-timeout-seconds: "5"
    alb.ingress.kubernetes.io/healthy-threshold-count: "2"
    alb.ingress.kubernetes.io/unhealthy-threshold-count: "3"
  hosts:
    - host: docs.mosaiclife.me
      paths:
        - path: /
          pathType: Prefix
  tls: []

# External DNS annotation
externalDns:
  enabled: true
  hostname: docs.mosaiclife.me

# Resource limits
resources:
  limits:
    cpu: 100m
    memory: 128Mi
  requests:
    cpu: 50m
    memory: 64Mi

# Probes
livenessProbe:
  httpGet:
    path: /health
    port: http
  initialDelaySeconds: 5
  periodSeconds: 10
  timeoutSeconds: 3
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health
    port: http
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3

# Pod disruption budget
podDisruptionBudget:
  enabled: true
  minAvailable: 1

# Autoscaling (optional, disabled by default for docs)
autoscaling:
  enabled: false
  minReplicas: 2
  maxReplicas: 4
  targetCPUUtilizationPercentage: 80

# Node selector
nodeSelector: {}

# Tolerations
tolerations: []

# Affinity
affinity: {}

# Pod annotations
podAnnotations: {}

# Pod security context
podSecurityContext:
  runAsNonRoot: true
  runAsUser: 101
  runAsGroup: 101
  fsGroup: 101

# Container security context
securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop:
      - ALL
```

**Step 3: Create _helpers.tpl**

Create `infra/helm/docs/templates/_helpers.tpl`:

```yaml
{{/*
Expand the name of the chart.
*/}}
{{- define "docs.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "docs.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "docs.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "docs.labels" -}}
helm.sh/chart: {{ include "docs.chart" . }}
{{ include "docs.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "docs.selectorLabels" -}}
app.kubernetes.io/name: {{ include "docs.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
```

**Step 4: Commit**

```bash
git add infra/helm/docs/Chart.yaml infra/helm/docs/values.yaml infra/helm/docs/templates/_helpers.tpl
git commit -m "feat(helm): add docs chart base structure"
```

---

### Task 9: Create Helm Deployment Template

Create the Kubernetes Deployment template.

**Files:**
- Create: `infra/helm/docs/templates/deployment.yaml`

**Step 1: Create deployment.yaml**

Create `infra/helm/docs/templates/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "docs.fullname" . }}
  labels:
    {{- include "docs.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "docs.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      {{- with .Values.podAnnotations }}
      annotations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      labels:
        {{- include "docs.selectorLabels" . | nindent 8 }}
    spec:
      {{- with .Values.podSecurityContext }}
      securityContext:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      containers:
        - name: {{ .Chart.Name }}
          {{- with .Values.securityContext }}
          securityContext:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ .Values.service.targetPort }}
              protocol: TCP
          {{- with .Values.livenessProbe }}
          livenessProbe:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.readinessProbe }}
          readinessProbe:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.resources }}
          resources:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          volumeMounts:
            - name: tmp
              mountPath: /tmp
            - name: nginx-cache
              mountPath: /var/cache/nginx
            - name: nginx-run
              mountPath: /var/run
      volumes:
        - name: tmp
          emptyDir: {}
        - name: nginx-cache
          emptyDir: {}
        - name: nginx-run
          emptyDir: {}
      {{- with .Values.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.affinity }}
      affinity:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.tolerations }}
      tolerations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
```

**Step 2: Verify template renders**

```bash
helm template test infra/helm/docs 2>&1 | head -60
```

Expected: Deployment YAML renders without errors.

**Step 3: Commit**

```bash
git add infra/helm/docs/templates/deployment.yaml
git commit -m "feat(helm): add docs deployment template"
```

---

### Task 10: Create Helm Service and Ingress Templates

Create Service and Ingress templates.

**Files:**
- Create: `infra/helm/docs/templates/service.yaml`
- Create: `infra/helm/docs/templates/ingress.yaml`

**Step 1: Create service.yaml**

Create `infra/helm/docs/templates/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "docs.fullname" . }}
  labels:
    {{- include "docs.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    {{- include "docs.selectorLabels" . | nindent 4 }}
```

**Step 2: Create ingress.yaml**

Create `infra/helm/docs/templates/ingress.yaml`:

```yaml
{{- if .Values.ingress.enabled -}}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "docs.fullname" . }}
  labels:
    {{- include "docs.labels" . | nindent 4 }}
  annotations:
    {{- with .Values.ingress.annotations }}
    {{- toYaml . | nindent 4 }}
    {{- end }}
    {{- if .Values.externalDns.enabled }}
    external-dns.alpha.kubernetes.io/hostname: {{ .Values.externalDns.hostname | quote }}
    {{- end }}
spec:
  {{- if .Values.ingress.className }}
  ingressClassName: {{ .Values.ingress.className }}
  {{- end }}
  {{- if .Values.ingress.tls }}
  tls:
    {{- range .Values.ingress.tls }}
    - hosts:
        {{- range .hosts }}
        - {{ . | quote }}
        {{- end }}
      secretName: {{ .secretName }}
    {{- end }}
  {{- end }}
  rules:
    {{- range .Values.ingress.hosts }}
    - host: {{ .host | quote }}
      http:
        paths:
          {{- range .paths }}
          - path: {{ .path }}
            pathType: {{ .pathType }}
            backend:
              service:
                name: {{ include "docs.fullname" $ }}
                port:
                  number: {{ $.Values.service.port }}
          {{- end }}
    {{- end }}
{{- end }}
```

**Step 3: Verify templates render**

```bash
helm template test infra/helm/docs 2>&1 | grep -A 20 "kind: Service"
helm template test infra/helm/docs 2>&1 | grep -A 30 "kind: Ingress"
```

Expected: Both templates render correctly.

**Step 4: Commit**

```bash
git add infra/helm/docs/templates/service.yaml infra/helm/docs/templates/ingress.yaml
git commit -m "feat(helm): add docs service and ingress templates"
```

---

### Task 11: Create Helm PodDisruptionBudget Template

Create PDB for high availability.

**Files:**
- Create: `infra/helm/docs/templates/pdb.yaml`

**Step 1: Create pdb.yaml**

Create `infra/helm/docs/templates/pdb.yaml`:

```yaml
{{- if .Values.podDisruptionBudget.enabled }}
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: {{ include "docs.fullname" . }}
  labels:
    {{- include "docs.labels" . | nindent 4 }}
spec:
  minAvailable: {{ .Values.podDisruptionBudget.minAvailable }}
  selector:
    matchLabels:
      {{- include "docs.selectorLabels" . | nindent 6 }}
{{- end }}
```

**Step 2: Commit**

```bash
git add infra/helm/docs/templates/pdb.yaml
git commit -m "feat(helm): add docs pod disruption budget template"
```

---

### Task 12: Create Environment-Specific Values Files

Create values files for staging and production.

**Files:**
- Create: `infra/helm/docs/values-staging.yaml`
- Create: `infra/helm/docs/values-prod.yaml`

**Step 1: Create values-staging.yaml**

Create `infra/helm/docs/values-staging.yaml`:

```yaml
# Staging-specific values for docs

replicaCount: 1

image:
  tag: "develop"

ingress:
  annotations:
    alb.ingress.kubernetes.io/group.name: mosaic-life-staging
    alb.ingress.kubernetes.io/group.order: "30"
  hosts:
    - host: stage-docs.mosaiclife.me
      paths:
        - path: /
          pathType: Prefix

externalDns:
  hostname: stage-docs.mosaiclife.me

resources:
  limits:
    cpu: 100m
    memory: 128Mi
  requests:
    cpu: 25m
    memory: 32Mi

podDisruptionBudget:
  enabled: false

autoscaling:
  enabled: false
```

**Step 2: Create values-prod.yaml**

Create `infra/helm/docs/values-prod.yaml`:

```yaml
# Production-specific values for docs

replicaCount: 2

image:
  tag: "latest"

ingress:
  annotations:
    alb.ingress.kubernetes.io/group.name: mosaic-life-main
    alb.ingress.kubernetes.io/group.order: "30"
  hosts:
    - host: docs.mosaiclife.me
      paths:
        - path: /
          pathType: Prefix

externalDns:
  hostname: docs.mosaiclife.me

resources:
  limits:
    cpu: 100m
    memory: 128Mi
  requests:
    cpu: 50m
    memory: 64Mi

podDisruptionBudget:
  enabled: true
  minAvailable: 1

autoscaling:
  enabled: false
```

**Step 3: Test staging values**

```bash
helm template test infra/helm/docs -f infra/helm/docs/values-staging.yaml 2>&1 | grep -E "(host:|replicas:)"
```

Expected: Shows `stage-docs.mosaiclife.me` and `replicas: 1`

**Step 4: Test prod values**

```bash
helm template test infra/helm/docs -f infra/helm/docs/values-prod.yaml 2>&1 | grep -E "(host:|replicas:)"
```

Expected: Shows `docs.mosaiclife.me` and `replicas: 2`

**Step 5: Commit**

```bash
git add infra/helm/docs/values-staging.yaml infra/helm/docs/values-prod.yaml
git commit -m "feat(helm): add docs environment-specific values files"
```

---

## Phase 4: ArgoCD Applications

### Task 13: Create ArgoCD Application for Production

Create the ArgoCD application definition for production docs.

**Files:**
- Create: `infra/argocd/applications/docs-prod.yaml`

**Step 1: Create docs-prod.yaml**

Create `infra/argocd/applications/docs-prod.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: docs-prod
  namespace: argocd
  annotations:
    notifications.argoproj.io/subscribe.on-deployed.slack: mosaic-deployments
    notifications.argoproj.io/subscribe.on-health-degraded.slack: mosaic-alerts
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: mosaic-life

  sources:
    # Source 1: Helm chart from application repository
    - repoURL: https://github.com/mosaic-stories/mosaic-life
      targetRevision: main
      path: infra/helm/docs
      helm:
        valueFiles:
          - values.yaml
          - values-prod.yaml
          - $values/environments/prod/docs-values.yaml

    # Source 2: Image tag values from GitOps repository
    - repoURL: https://github.com/mosaic-stories/gitops.git
      targetRevision: main
      ref: values

  destination:
    server: https://kubernetes.default.svc
    namespace: mosaic-prod

  syncPolicy:
    automated:
      prune: true
      selfHeal: true
      allowEmpty: false
    syncOptions:
      - CreateNamespace=true
      - PrunePropagationPolicy=foreground
      - PruneLast=true
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m

  ignoreDifferences:
    - group: apps
      kind: Deployment
      jsonPointers:
        - /spec/replicas
```

**Step 2: Commit**

```bash
git add infra/argocd/applications/docs-prod.yaml
git commit -m "feat(argocd): add docs-prod application"
```

---

### Task 14: Create ArgoCD Application for Staging

Create the ArgoCD application definition for staging docs.

**Files:**
- Create: `infra/argocd/applications/docs-staging.yaml`

**Step 1: Create docs-staging.yaml**

Create `infra/argocd/applications/docs-staging.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: docs-staging
  namespace: argocd
  annotations:
    notifications.argoproj.io/subscribe.on-deployed.slack: mosaic-deployments
    notifications.argoproj.io/subscribe.on-health-degraded.slack: mosaic-alerts
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: mosaic-life

  sources:
    # Source 1: Helm chart from application repository
    - repoURL: https://github.com/mosaic-stories/mosaic-life
      targetRevision: develop
      path: infra/helm/docs
      helm:
        valueFiles:
          - values.yaml
          - values-staging.yaml
          - $values/environments/staging/docs-values.yaml

    # Source 2: Image tag values from GitOps repository
    - repoURL: https://github.com/mosaic-stories/gitops.git
      targetRevision: main
      ref: values

  destination:
    server: https://kubernetes.default.svc
    namespace: mosaic-staging

  syncPolicy:
    automated:
      prune: true
      selfHeal: true
      allowEmpty: false
    syncOptions:
      - CreateNamespace=true
      - PrunePropagationPolicy=foreground
      - PruneLast=true
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m

  ignoreDifferences:
    - group: apps
      kind: Deployment
      jsonPointers:
        - /spec/replicas
```

**Step 2: Commit**

```bash
git add infra/argocd/applications/docs-staging.yaml
git commit -m "feat(argocd): add docs-staging application"
```

---

## Phase 5: GitHub Actions CI/CD

### Task 15: Create Documentation Build Workflow

Create the GitHub Actions workflow for building and pushing docs images.

**Files:**
- Create: `.github/workflows/docs.yml`

**Step 1: Create docs.yml workflow**

Create `.github/workflows/docs.yml`:

```yaml
name: CI - Documentation

on:
  push:
    branches:
      - main
      - develop
    paths:
      - 'apps/docs/**'
      - 'services/core-api/app/**'
      - 'apps/web/src/**'
      - 'packages/**'
      - '.github/workflows/docs.yml'
  pull_request:
    branches:
      - main
      - develop
    paths:
      - 'apps/docs/**'
      - 'services/core-api/app/**'
      - 'apps/web/src/**'
      - 'packages/**'
      - '.github/workflows/docs.yml'
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      deploy_version:
        description: 'Version tag to deploy (e.g., v1.0.0)'
        required: false
        type: string

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: mosaic-life/docs

jobs:
  # Job 1: Build and test documentation
  build:
    name: Build Documentation
    runs-on: ubuntu-latest
    outputs:
      image_tag: ${{ steps.meta.outputs.version }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install uv
        uses: astral-sh/setup-uv@v4
        with:
          version: "latest"

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: apps/docs/package-lock.json

      - name: Install Python dependencies (docs)
        working-directory: apps/docs
        run: uv sync

      - name: Install Python dependencies (core-api for OpenAPI)
        working-directory: services/core-api
        run: uv sync

      - name: Install Node dependencies
        working-directory: apps/docs
        run: npm ci

      - name: Generate OpenAPI specification
        working-directory: apps/docs
        run: bash scripts/generate-openapi.sh

      - name: Generate TypeDoc
        working-directory: apps/docs
        run: bash scripts/generate-typedoc.sh
        continue-on-error: true

      - name: Build MkDocs
        working-directory: apps/docs
        run: uv run mkdocs build --strict

      - name: Upload build artifact
        uses: actions/upload-artifact@v4
        with:
          name: docs-site
          path: apps/docs/site/
          retention-days: 7

  # Job 2: Build and push Docker image (only on push to main/develop or release)
  push:
    name: Build & Push Docker Image
    runs-on: ubuntu-latest
    needs: build
    if: github.event_name != 'pull_request'
    permissions:
      id-token: write
      contents: read
      packages: write

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Download build artifact
        uses: actions/download-artifact@v4
        with:
          name: docs-site
          path: apps/docs/site/

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::033691785857:role/github-actions-ecr-push
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Docker meta
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY }}
          tags: |
            type=sha,format=short,prefix=
            type=ref,event=branch
            type=semver,pattern={{version}}
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/docs/Dockerfile.ci
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          provenance: false

      - name: Generate SBOM
        uses: anchore/sbom-action@v0
        with:
          image: ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY }}:${{ github.sha }}
          format: spdx-json
          output-file: sbom.spdx.json

      - name: Scan image
        uses: anchore/scan-action@v4
        with:
          image: ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY }}:${{ github.sha }}
          fail-build: false
          severity-cutoff: high

  # Job 3: Update GitOps repository with new image tag
  update-gitops:
    name: Update GitOps
    runs-on: ubuntu-latest
    needs: push
    if: github.event_name != 'pull_request'

    steps:
      - name: Checkout GitOps repo
        uses: actions/checkout@v4
        with:
          repository: mosaic-stories/gitops
          token: ${{ secrets.GITOPS_PAT }}
          path: gitops

      - name: Determine environment
        id: env
        run: |
          if [[ "${{ github.ref }}" == "refs/heads/main" ]] || [[ "${{ github.event_name }}" == "release" ]]; then
            echo "environment=prod" >> $GITHUB_OUTPUT
            echo "values_file=environments/prod/docs-values.yaml" >> $GITHUB_OUTPUT
          else
            echo "environment=staging" >> $GITHUB_OUTPUT
            echo "values_file=environments/staging/docs-values.yaml" >> $GITHUB_OUTPUT
          fi

      - name: Update image tag
        working-directory: gitops
        run: |
          # Create docs-values.yaml if it doesn't exist
          mkdir -p $(dirname ${{ steps.env.outputs.values_file }})

          if [ ! -f "${{ steps.env.outputs.values_file }}" ]; then
            echo "image:" > ${{ steps.env.outputs.values_file }}
            echo "  tag: \"\"" >> ${{ steps.env.outputs.values_file }}
          fi

          # Update the image tag
          yq e '.image.tag = "${{ github.sha }}"' -i ${{ steps.env.outputs.values_file }}

      - name: Commit and push
        working-directory: gitops
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add .
          git diff --staged --quiet || git commit -m "chore(docs): update image tag to ${{ github.sha }}

          Triggered by: ${{ github.event_name }}
          Branch: ${{ github.ref_name }}
          Commit: ${{ github.sha }}
          Actor: ${{ github.actor }}"
          git push

  # Job 4: Version documentation (only on release)
  version-docs:
    name: Version Documentation
    runs-on: ubuntu-latest
    needs: build
    if: github.event_name == 'release'

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install uv
        uses: astral-sh/setup-uv@v4

      - name: Install dependencies
        working-directory: apps/docs
        run: uv sync

      - name: Configure Git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Deploy versioned docs with mike
        working-directory: apps/docs
        run: |
          VERSION="${{ github.event.release.tag_name }}"
          uv run mike deploy --push --update-aliases $VERSION latest
```

**Step 2: Create Dockerfile.ci for pre-built artifact**

Create `apps/docs/Dockerfile.ci`:

```dockerfile
# syntax=docker/dockerfile:1

# Simplified Dockerfile for CI - uses pre-built site from artifact
FROM nginx:1.27-alpine

# Copy pre-built documentation (from CI artifact)
COPY apps/docs/site /usr/share/nginx/html

# Copy nginx configuration
COPY apps/docs/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
```

**Step 3: Commit**

```bash
git add .github/workflows/docs.yml apps/docs/Dockerfile.ci
git commit -m "feat(ci): add documentation build and deploy workflow"
```

---

## Phase 6: Finishing Touches

### Task 16: Update Justfile with Docs Commands

Add convenience commands for documentation development.

**Files:**
- Modify: `justfile`

**Step 1: Add docs commands to justfile**

Add the following to the `justfile`:

```makefile
# Documentation commands
docs-serve:
    cd apps/docs && uv run mkdocs serve

docs-build:
    cd apps/docs && bash scripts/build.sh

docs-generate-openapi:
    cd apps/docs && bash scripts/generate-openapi.sh

docs-generate-typedoc:
    cd apps/docs && bash scripts/generate-typedoc.sh

docs-docker-build:
    docker compose -f infra/compose/docker-compose.yml --profile docs build docs

docs-docker-up:
    docker compose -f infra/compose/docker-compose.yml --profile docs up docs -d

docs-docker-down:
    docker compose -f infra/compose/docker-compose.yml --profile docs down
```

**Step 2: Commit**

```bash
git add justfile
git commit -m "feat(just): add documentation convenience commands"
```

---

### Task 17: Create ECR Repository

Create the ECR repository for docs images (manual step or via CDK).

**Step 1: Create ECR repository via AWS CLI**

```bash
aws ecr create-repository \
  --repository-name mosaic-life/docs \
  --region us-east-1 \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=AES256
```

Expected: Repository created successfully.

**Step 2: Document the repository**

Note: The ECR repository ARN is `arn:aws:ecr:us-east-1:033691785857:repository/mosaic-life/docs`

---

### Task 18: Create GitOps Values Files

Create the docs-values.yaml files in the GitOps repository.

**Note:** This requires access to the `mosaic-stories/gitops` repository.

**Step 1: Create staging docs-values.yaml**

In the GitOps repository, create `environments/staging/docs-values.yaml`:

```yaml
image:
  tag: "develop"
```

**Step 2: Create prod docs-values.yaml**

In the GitOps repository, create `environments/prod/docs-values.yaml`:

```yaml
image:
  tag: "latest"
```

**Step 3: Commit to GitOps repo**

```bash
git add environments/staging/docs-values.yaml environments/prod/docs-values.yaml
git commit -m "feat(docs): add docs values files for staging and prod"
git push
```

---

### Task 19: Update CLAUDE.md with Docs Service Information

Document the new service in CLAUDE.md.

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add docs service to Common Development Commands section**

Find the "Common Development Commands" section and add:

```markdown
### Documentation Development

```bash
cd apps/docs

# Install dependencies
uv sync
npm install

# Serve docs locally with hot reload
uv run mkdocs serve

# Build documentation (includes OpenAPI and TypeDoc generation)
bash scripts/build.sh

# Generate OpenAPI spec only
bash scripts/generate-openapi.sh

# Generate TypeDoc only
bash scripts/generate-typedoc.sh
```

Or use just commands:

```bash
just docs-serve      # Serve locally
just docs-build      # Full build
just docs-docker-up  # Run in Docker
```
```

**Step 2: Add docs to File Structure section**

Update the file structure to include:

```
├── apps/
│   ├── web/              # React + Vite frontend
│   └── docs/             # MkDocs documentation site
│       ├── docs/         # Markdown source
│       ├── scripts/      # Build scripts
│       ├── mkdocs.yml    # MkDocs configuration
│       └── Dockerfile
```

**Step 3: Add docs to Local Environment section**

Add to the Services and Ports table:

```
- Documentation: http://localhost:8000 (via docker compose --profile docs)
```

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add documentation service to CLAUDE.md"
```

---

### Task 20: Apply ArgoCD Applications

Apply the ArgoCD application definitions to the cluster.

**Step 1: Apply staging application**

```bash
kubectl apply -f infra/argocd/applications/docs-staging.yaml
```

Expected: Application created.

**Step 2: Apply production application**

```bash
kubectl apply -f infra/argocd/applications/docs-prod.yaml
```

Expected: Application created.

**Step 3: Verify applications**

```bash
argocd app list | grep docs
```

Expected: Shows `docs-staging` and `docs-prod` applications.

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `just docs-serve` starts local development server
- [ ] `just docs-build` generates complete documentation
- [ ] `just docs-docker-up` runs docs in Docker
- [ ] Documentation accessible at http://localhost:8000
- [ ] OpenAPI spec rendered in API section
- [ ] Python autodocs generated in reference section
- [ ] TypeScript docs generated (may have warnings initially)
- [ ] GitHub Actions workflow passes on push to develop
- [ ] ArgoCD shows docs-staging as Healthy
- [ ] `stage-docs.mosaiclife.me` accessible after first deploy
- [ ] Version selector appears after first release tag

---

## Post-Implementation Notes

### Adding New Documentation

1. Create Markdown files in `apps/docs/docs/`
2. Update `nav:` section in `mkdocs.yml`
3. Push to develop for staging, main for production

### Creating a Version

1. Create a Git tag: `git tag v1.0.0`
2. Push the tag: `git push origin v1.0.0`
3. GitHub Actions will run `mike deploy` to version the docs
4. Version appears in dropdown after deployment

### Updating OpenAPI Spec

The OpenAPI spec is regenerated on every docs build. To update:

1. Modify FastAPI routes/schemas in `services/core-api/`
2. Push changes
3. Docs rebuild automatically includes new spec

---

Plan complete and saved to `docs/plans/2025-12-02-documentation-service-implementation.md`.

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
