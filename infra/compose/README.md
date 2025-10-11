# Docker Compose Local Development

This directory contains Docker Compose configuration for running the Mosaic Life application locally.

## Quick Start

### 1. Setup Environment Variables

Copy the example environment file and customize as needed:

```bash
cd infra/compose
cp .env.example .env
```

The default values in `.env.example` are configured for local development and should work out of the box.

### 2. Start All Services

From the project root:

```bash
docker compose -f infra/compose/docker-compose.yml up -d
```

Or from the compose directory:

```bash
cd infra/compose
docker compose up -d
```

### 3. Verify Services are Running

```bash
docker compose -f infra/compose/docker-compose.yml ps
```

You should see all services in a healthy state:
- `core-api` - Backend API service
- `web` - Frontend React app
- `postgres` - PostgreSQL database
- `opensearch` - OpenSearch for indexing and search
- `localstack` - AWS services emulation (SNS, SQS, S3)
- `jaeger` - Distributed tracing

### 4. Access the Application

- **Web App**: http://localhost:3001
- **API**: http://localhost:8080
- **API Docs**: http://localhost:8080/docs (FastAPI Swagger UI)
- **Jaeger UI**: http://localhost:16686 (Distributed tracing)
- **OpenSearch**: http://localhost:9200
- **PostgreSQL**: localhost:15432 (user: postgres, password: postgres, db: core)

## Common Commands

### View Logs

```bash
# All services
docker compose -f infra/compose/docker-compose.yml logs -f

# Specific service
docker compose -f infra/compose/docker-compose.yml logs -f core-api
docker compose -f infra/compose/docker-compose.yml logs -f web
```

### Stop Services

```bash
docker compose -f infra/compose/docker-compose.yml stop
```

### Stop and Remove Containers

```bash
docker compose -f infra/compose/docker-compose.yml down
```

### Rebuild Services

```bash
# Rebuild all services
docker compose -f infra/compose/docker-compose.yml build

# Rebuild specific service
docker compose -f infra/compose/docker-compose.yml build core-api

# Rebuild and restart
docker compose -f infra/compose/docker-compose.yml up -d --build
```

### Reset Everything (Nuclear Option)

This will stop all services, remove containers, and delete all volumes:

```bash
# Stop and remove containers
docker compose -f infra/compose/docker-compose.yml down

# Remove volume data (from project root)
rm -rf .local/postgres-data .local/opensearch-data .local/localstack-data .local/jaeger-data

# Recreate volume directories
mkdir -p .local/postgres-data .local/opensearch-data .local/localstack-data .local/jaeger-data

# Start fresh
docker compose -f infra/compose/docker-compose.yml up -d
```

## Service Details

### Core API (Backend)

- **Technology**: Python, FastAPI, SQLAlchemy
- **Port**: 8080
- **Source Code**: `services/core-api/`
- **Development**: Source code is mounted as read-only volume for hot-reload
- **Migrations**: Automatically run on startup via `scripts/start.sh`

#### Running Migrations Manually

```bash
docker compose -f infra/compose/docker-compose.yml exec core-api alembic upgrade head
```

#### Creating New Migrations

```bash
docker compose -f infra/compose/docker-compose.yml exec core-api alembic revision --autogenerate -m "description"
```

### Web (Frontend)

- **Technology**: React, TypeScript, Vite
- **Port**: 3001
- **Source Code**: `apps/web/`
- **Build**: Production build served by nginx

#### Development with Hot Reload

For frontend development with hot module replacement, run the dev server directly instead of Docker:

```bash
cd apps/web
npm install
npm run dev  # Runs on http://localhost:5173
```

The dev server will proxy API requests to the Docker-based core-api service.

### PostgreSQL

- **Version**: 16
- **Port**: 15432
- **Data**: Stored in `.local/postgres-data/`
- **Connection String**: `postgresql://postgres:postgres@localhost:15432/core`

#### Connecting with psql

```bash
docker compose -f infra/compose/docker-compose.yml exec postgres psql -U postgres -d core
```

Or from your host (requires psql client):

```bash
psql -h localhost -p 15432 -U postgres -d core
```

### OpenSearch

- **Version**: 2.13.0
- **Port**: 9200 (HTTP), 9600 (Performance analyzer)
- **Data**: Stored in `.local/opensearch-data/`
- **Security**: Disabled for local development

#### Check Cluster Health

```bash
curl http://localhost:9200/_cluster/health?pretty
```

#### List Indices

```bash
curl http://localhost:9200/_cat/indices?v
```

### LocalStack (AWS Emulation)

- **Services**: SNS, SQS, S3
- **Port**: 4566
- **Data**: Stored in `.local/localstack-data/`

#### Access LocalStack Services

Using AWS CLI with LocalStack endpoint:

```bash
aws --endpoint-url=http://localhost:4566 sqs list-queues
aws --endpoint-url=http://localhost:4566 sns list-topics
aws --endpoint-url=http://localhost:4566 s3 ls
```

### Jaeger (Distributed Tracing)

- **UI Port**: 16686
- **OTLP gRPC**: 4317
- **OTLP HTTP**: 4318
- **Storage**: In-memory (data lost on restart)

## Environment Configuration

### Customizing Environment Variables

Edit `infra/compose/.env` to customize:

- **Service Ports**: Change if ports conflict with existing services
- **Resource Limits**: Adjust memory/CPU allocations
- **Log Levels**: Set to `debug` for more verbose logging
- **AWS Configuration**: Customize LocalStack behavior

### Important Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ENV` | Application environment | `dev` |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `CORE_API_PORT` | Host port for core-api | `8080` |
| `WEB_PORT` | Host port for web app | `3001` |
| `POSTGRES_PORT` | Host port for PostgreSQL | `15432` |
| `DB_URL` | Database connection string | See `.env.example` |
| `OPENSEARCH_URL` | OpenSearch endpoint | `http://opensearch:9200` |
| `AWS_ENDPOINT_URL` | LocalStack endpoint | `http://localstack:4566` |

## Troubleshooting

### Port Conflicts

If ports are already in use, modify them in `.env`:

```bash
CORE_API_PORT=8081
WEB_PORT=3002
POSTGRES_PORT=15433
```

### Database Connection Issues

```bash
# Check if PostgreSQL is healthy
docker compose -f infra/compose/docker-compose.yml ps postgres

# View PostgreSQL logs
docker compose -f infra/compose/docker-compose.yml logs postgres

# Reset database
docker compose -f infra/compose/docker-compose.yml stop postgres
rm -rf .local/postgres-data/*
docker compose -f infra/compose/docker-compose.yml up -d postgres
```

### OpenSearch Memory Issues

If OpenSearch fails to start due to memory constraints:

1. Increase Docker memory allocation to 4GB+ in Docker Desktop settings
2. Or reduce OpenSearch heap size in `.env`:

```bash
OPENSEARCH_JAVA_OPTS=-Xms256m -Xmx256m
```

### Build Cache Issues

Clear Docker build cache:

```bash
docker compose -f infra/compose/docker-compose.yml build --no-cache
docker system prune -f
```

### Permission Issues with Volumes

If you encounter permission errors with volume mounts:

```bash
# Fix ownership (Linux/Mac)
sudo chown -R $USER:$USER .local/

# Or run Docker with your user ID
# Add to docker-compose.yml under service:
user: "${UID}:${GID}"
```

## Data Persistence

All service data is stored in `.local/` directory:

```
.local/
├── postgres-data/      # PostgreSQL database files
├── opensearch-data/    # OpenSearch indices and data
├── localstack-data/    # LocalStack state (S3, SNS, SQS)
└── jaeger-data/        # Jaeger traces (temporary)
```

This directory is excluded from git via `.gitignore`.

## Development Workflow

### Typical Development Loop

1. **Start services**:
   ```bash
   docker compose -f infra/compose/docker-compose.yml up -d
   ```

2. **Develop backend**: Edit Python files in `services/core-api/app/`
   - Changes are reflected immediately (mounted as volume)
   - Service auto-reloads on file changes (uvicorn --reload)

3. **Develop frontend**: Run dev server
   ```bash
   cd apps/web && npm run dev
   ```

4. **Run tests**:
   ```bash
   # Backend tests
   cd services/core-api && pytest

   # Frontend tests
   cd apps/web && npm test
   ```

5. **View traces**: http://localhost:16686

### Updating Dependencies

#### Backend (Python)

```bash
# Update pyproject.toml, then rebuild
docker compose -f infra/compose/docker-compose.yml build core-api
docker compose -f infra/compose/docker-compose.yml up -d core-api
```

#### Frontend (Node.js)

```bash
cd apps/web
npm install <package>
# Rebuild container
docker compose -f infra/compose/docker-compose.yml build web
docker compose -f infra/compose/docker-compose.yml up -d web
```

## Additional Resources

- [Project Overview](../../CLAUDE.md)
- [Architecture Documentation](../../docs/architecture/)
- [Developer Guide](../../docs/developer/LOCAL.md)
- [Coding Standards](../../docs/developer/CODING-STANDARDS.md)
