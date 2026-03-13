# syntax=docker/dockerfile:1

# ==============================================================================
# Stage 0: Exact Node.js runtime for TypeDoc
# ==============================================================================
FROM node:22.22.1-bookworm-slim AS node-runtime

# ==============================================================================
# Stage 1: Build environment
# ==============================================================================
FROM python:3.12-slim AS builder

WORKDIR /build

# Copy an exact Node.js 22.22.1 runtime into the Python builder image.
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN printf '%s\n' '#!/bin/sh' 'exec node /usr/local/lib/node_modules/npm/bin/npm-cli.js "$@"' > /usr/local/bin/npm \
    && printf '%s\n' '#!/bin/sh' 'exec node /usr/local/lib/node_modules/npm/bin/npx-cli.js "$@"' > /usr/local/bin/npx \
    && chmod +x /usr/local/bin/npm /usr/local/bin/npx

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
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
