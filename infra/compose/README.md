# Mosaic Life - Local Development with Docker Compose

This directory contains Docker Compose configuration for running Mosaic Life locally.

## Quick Start

1. **Copy environment template:**
   ```bash
   cp .env.example .env
   ```

2. **Start all services:**
   ```bash
   docker compose up -d
   ```

3. **View logs:**
   ```bash
   docker compose logs -f
   ```

4. **Access services:**
   - Frontend (dev): http://localhost:5173
   - Frontend (prod build): http://localhost:3001
   - Backend API: http://localhost:8080
   - Jaeger UI: http://localhost:16686
   - OpenSearch: http://localhost:9200
   - PostgreSQL: localhost:15432

## Authentication Modes

### Development Mode (Default)

By default, Cognito authentication is **disabled** for local development:

```bash
ENABLE_COGNITO_AUTH=false
```

In this mode, the app uses a stub authentication system that doesn't require real Cognito credentials.

### Testing with Real Cognito

To test with actual AWS Cognito:

1. **Deploy or use existing Cognito User Pool** (see main repo README)

2. **Get Cognito configuration:**
   ```bash
   # From the infrastructure directory
   cd ../../infra/cdk
   ./scripts/setup-cognito.sh
   ```

3. **Update .env file** with Cognito values:
   ```bash
   ENABLE_COGNITO_AUTH=true
   COGNITO_REGION=us-east-1
   COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
   COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxx
   COGNITO_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   COGNITO_DOMAIN=mosaic-prod-XXXXXXXXXXXX
   ```

4. **Update callback URLs in Cognito:**
   - Go to AWS Console → Cognito → User Pools → App Integration
   - Add callback URL: `http://localhost:8080/api/auth/callback`
   - Add logout URL: `http://localhost:5173`

5. **Restart services:**
   ```bash
   docker compose restart core-api
   ```

## Troubleshooting

### Port Conflicts

If ports are already in use, modify them in `.env`:

```bash
CORE_API_PORT=8081
WEB_PORT=3002
POSTGRES_PORT=15433
```

### Reset Everything

```bash
docker compose down -v
docker volume prune -f
docker compose up -d
```

### View Service Health

```bash
# Check all services
docker compose ps

# Check core-api health
curl http://localhost:8080/healthz

# Check specific service logs
docker compose logs -f core-api
```

## Database Access

```bash
# Connect to PostgreSQL
docker exec -it $(docker compose ps -q postgres) psql -U postgres -d core

# Run migrations
docker compose exec core-api alembic upgrade head
```

## Development Workflow

1. **Code changes** are automatically reflected (volumes mounted)
2. **Frontend hot reload** works at http://localhost:5173
3. **Backend auto-reload** with FastAPI's `--reload` flag

## Environment Variables

See `.env.example` for all available configuration options.

Key variables:
- `ENABLE_COGNITO_AUTH`: Enable/disable Cognito authentication
- `APP_URL`: Frontend URL (for OAuth redirects)
- `API_URL`: Backend URL (for OAuth redirects)
- `SESSION_SECRET_KEY`: Secret for signing cookies (generate with `openssl rand -base64 32`)
