# syntax=docker/dockerfile:1

# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund || npm install --no-audit --no-fund
COPY . .
RUN npm run build

# Runtime stage (nginx)
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
# nginx:alpine automatically processes .template files in /etc/nginx/templates/ with envsubst at startup,
# substituting environment variables into the nginx config. See https://hub.docker.com/_/nginx
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Default prerender host for Docker Compose (can be overridden via env var)
ENV PRERENDER_HOST=prerender:3000

EXPOSE 8080

# Use envsubst to substitute environment variables in nginx config at startup
# nginx:alpine includes envsubst and auto-processes /etc/nginx/templates/*.template files
CMD ["nginx", "-g", "daemon off;"]
