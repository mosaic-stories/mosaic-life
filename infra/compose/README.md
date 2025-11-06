# Local Development with Docker Compose

This directory contains the simplified Docker Compose configuration for local development of Mosaic Life.

## Quick Start

```bash
# 1. Copy environment file
cp .env.example .env

# 2. Configure Google OAuth (see .env file)
#    - Get credentials from https://console.cloud.google.com/apis/credentials
#    - Add redirect URI: http://localhost:8080/auth/google/callback
#    - Add origin: http://localhost:5173

# 3. Start all services
docker compose up -d

# 4. Run database migrations
docker compose exec core-api alembic upgrade head

# 5. (Optional) Seed development data
docker compose exec core-api python scripts/seed_dev_data.py

# 6. Access the application
#    - Frontend: http://localhost:5173 (Vite dev server)
#    - Backend:  http://localhost:8080 (API)
#    - API Docs: http://localhost:8080/docs (Swagger UI)
```

## Services

### 1. PostgreSQL (postgres)
- **Port**: 15432 (avoid conflict with local Postgres on 5432)
- **Database**: mosaic
- **User**: postgres
- **Password**: postgres
- **Data**: Stored in Docker volume `postgres-data`

**Direct connection**:
```bash
psql -h localhost -p 15432 -U postgres -d mosaic
```

### 2. Backend API (core-api)
- **Port**: 8080
- **Technology**: FastAPI + Uvicorn
- **Hot Reload**: Enabled (code changes auto-reload)
- **API Docs**: http://localhost:8080/docs

**View logs**:
```bash
docker compose logs -f core-api
```

**Execute commands**:
```bash
# Run migrations
docker compose exec core-api alembic upgrade head

# Create new migration
docker compose exec core-api alembic revision --autogenerate -m "description"

# Python shell
docker compose exec core-api python
```

### 3. Frontend (web)
- **Port**: 5173
- **Technology**: Vite + React
- **Hot Module Reload**: Enabled
- **Access**: http://localhost:5173

**View logs**:
```bash
docker compose logs -f web
```

**Install dependencies**:
```bash
docker compose exec web npm install
```

## Development Workflow

### First Time Setup

1. **Configure Google OAuth**:
   - Go to https://console.cloud.google.com/apis/credentials
   - Create OAuth 2.0 Client ID (Web application)
   - Add authorized redirect: `http://localhost:8080/auth/google/callback`
   - Add authorized origin: `http://localhost:5173`
   - Copy Client ID and Secret to `.env`

2. **Generate Session Secret**:
   ```bash
   openssl rand -hex 32
   ```
   Add to `.env` as `SESSION_SECRET_KEY`

3. **Create S3 Bucket** (optional for local dev):
   ```bash
   aws s3 mb s3://mosaic-life-media-dev
   ```
   Or skip S3 setup initially and add later.

### Daily Development

```bash
# Start services
docker compose up -d

# View logs (all services)
docker compose logs -f

# Stop services
docker compose stop

# Stop and remove containers
docker compose down

# Reset everything (⚠️ deletes data)
docker compose down -v
```

### Code Changes

**Backend (Python)**:
- Edit files in `/services/core-api/app/`
- Changes auto-reload (Uvicorn watch mode)
- No restart needed

**Frontend (React)**:
- Edit files in `/apps/web/src/`
- Hot Module Reload (HMR) updates browser instantly
- No restart needed

**Dependencies**:
- Backend: Edit `pyproject.toml`, then rebuild: `docker compose build core-api`
- Frontend: Edit `package.json`, then: `docker compose exec web npm install`

### Database Operations

**Run migrations**:
```bash
docker compose exec core-api alembic upgrade head
```

**Create new migration**:
```bash
docker compose exec core-api alembic revision --autogenerate -m "add user table"
```

**Rollback migration**:
```bash
docker compose exec core-api alembic downgrade -1
```

**Connect to database**:
```bash
docker compose exec postgres psql -U postgres -d mosaic
```

**Backup database**:
```bash
docker compose exec postgres pg_dump -U postgres mosaic > backup.sql
```

**Restore database**:
```bash
docker compose exec -T postgres psql -U postgres -d mosaic < backup.sql
```

## Troubleshooting

### Port Already in Use

If you get "port already allocated" errors:

**Option 1**: Stop conflicting service
```bash
# Find what's using port 15432
lsof -i :15432
kill <PID>
```

**Option 2**: Change port in `.env`
```bash
POSTGRES_PORT=25432
```

### Database Connection Failed

```bash
# Check if postgres is healthy
docker compose ps

# View postgres logs
docker compose logs postgres

# Restart postgres
docker compose restart postgres
```

### Frontend Not Loading

```bash
# Check web service status
docker compose ps web

# View logs
docker compose logs -f web

# Restart web service
docker compose restart web

# Rebuild if dependencies changed
docker compose build web
docker compose up -d web
```

### Backend Not Starting

```bash
# View logs
docker compose logs -f core-api

# Check if it can connect to postgres
docker compose exec core-api python -c "from app.database import engine; print(engine.connect())"

# Restart
docker compose restart core-api
```

### Clean Slate Reset

If things are broken, reset everything:

```bash
# Stop and remove everything
docker compose down -v

# Start fresh
docker compose up -d

# Run migrations
docker compose exec core-api alembic upgrade head
```

## Performance Tips

### Faster Startup

1. **Use named volumes** (already configured) instead of bind mounts for node_modules
2. **Keep containers running** - use `docker compose stop` instead of `down`

### Reduce Memory Usage

If Docker is using too much memory:

1. **Limit container memory** in docker-compose.yml:
   ```yaml
   core-api:
     deploy:
       resources:
         limits:
           memory: 512M
   ```

2. **Stop unused services**:
   ```bash
   docker compose stop web  # Only run backend
   ```

## What's Different from Original?

**Removed** (simplified for MVP):
- ❌ OpenSearch (using Postgres search)
- ❌ Localstack (using real AWS S3)
- ❌ Jaeger (using simple logging)
- ❌ Neo4j (using Postgres relationships)
- ❌ Cognito (using Google OAuth)

**Result**:
- ⚡ Faster startup: <10 seconds (was 60+ seconds)
- 💾 Less memory: ~300MB (was 2GB+)
- 🧹 Simpler: 3 services (was 6)

**If you need observability**, you can add Jaeger back temporarily:
```yaml
# Add to docker-compose.yml
jaeger:
  image: jaegertracing/all-in-one:1.57
  ports:
    - "16686:16686"  # UI
    - "4318:4318"    # OTLP HTTP
```

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | *(required)* | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | *(required)* | Google OAuth Client Secret |
| `SESSION_SECRET_KEY` | `dev-secret...` | Session cookie signing key |
| `S3_MEDIA_BUCKET` | `mosaic-life-media-dev` | S3 bucket for uploads |
| `AWS_REGION` | `us-east-1` | AWS region |
| `LOG_LEVEL` | `debug` | Logging level |
| `POSTGRES_PORT` | `15432` | PostgreSQL port |

## External/Network Access

To access the application from a different machine on your network (e.g., `beelink.projecthewitt.info`):

### 1. Update Environment Variables

Edit `.env` and change the URLs from `localhost` to your hostname:

```bash
# Application URLs
APP_URL=http://beelink.projecthewitt.info:5173
API_URL=http://beelink.projecthewitt.info:8080

# Frontend Configuration
VITE_API_URL=http://beelink.projecthewitt.info:8080
VITE_BACKEND_URL=http://beelink.projecthewitt.info:8080
```

### 2. Update Google OAuth Configuration

In Google Cloud Console (https://console.cloud.google.com/apis/credentials):

**Add these authorized redirect URIs**:
- `http://beelink.projecthewitt.info:8080/api/auth/google/callback`
- `http://localhost:8080/api/auth/google/callback` (keep for local dev)

**Add these authorized JavaScript origins**:
- `http://beelink.projecthewitt.info:5173`
- `http://localhost:5173` (keep for local dev)

### 3. Restart Services

```bash
docker compose down
docker compose up -d
```

### 4. Access the Application

- Frontend: `http://beelink.projecthewitt.info:5173`
- Backend API: `http://beelink.projecthewitt.info:8080`
- API Docs: `http://beelink.projecthewitt.info:8080/docs`

### Important Notes

- **Firewall**: Ensure ports 5173 and 8080 are accessible on your network
- **HTTPS**: For production, you'll need HTTPS (cookies with `secure` flag)
- **Session cookies**: Will be set for your hostname domain
- **CORS**: Backend is configured to allow requests from `APP_URL`

## Next Steps

After getting the local environment running:

1. **Read the architecture**: [MVP-SIMPLIFIED-ARCHITECTURE.md](../../docs/architecture/MVP-SIMPLIFIED-ARCHITECTURE.md)
2. **Review the plan**: [MVP-SIMPLIFIED-EXECUTION-PLAN.md](../../docs/project/MVP-SIMPLIFIED-EXECUTION-PLAN.md)
3. **Check coding standards**: [CODING-STANDARDS.md](../../docs/developer/CODING-STANDARDS.md)
4. **Start building**: Follow Week 1 tasks in the execution plan

## Getting Help

- **Architecture questions**: See docs/architecture/
- **API questions**: http://localhost:8080/docs (when running)
- **Database schema**: services/core-api/alembic/versions/
- **Issues**: Open a GitHub issue

---

**Last Updated**: January 2025
**For**: MVP Simplified Architecture
