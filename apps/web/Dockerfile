# syntax=docker/dockerfile:1

# Build stage
FROM node:22.22.1-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Runtime stage (nginx)
FROM nginx:1.28-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
# nginx:alpine automatically processes .template files in /etc/nginx/templates/ with envsubst at startup,
# substituting environment variables into the nginx config. See https://hub.docker.com/_/nginx
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Runtime nginx configuration (substituted into the config template at startup).
# Defaults preserve the existing Docker Compose / Kubernetes behavior.
#   PRERENDER_HOST    - prerender service host:port; set empty to disable bot routing
#   NGINX_RESOLVER    - DNS resolver for runtime upstream lookups (ECS VPC: 169.254.169.253)
#   CORE_API_UPSTREAM - core-api host:port for /api/, /healthz, /readyz, sitemap, robots
ENV PRERENDER_HOST=prerender:3000 \
    NGINX_RESOLVER=kube-dns.kube-system.svc.cluster.local \
    CORE_API_UPSTREAM=core-api:8080

EXPOSE 8080

# Use envsubst to substitute environment variables in nginx config at startup
# nginx:alpine includes envsubst and auto-processes /etc/nginx/templates/*.template files
CMD ["nginx", "-g", "daemon off;"]
