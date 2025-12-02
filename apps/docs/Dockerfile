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
