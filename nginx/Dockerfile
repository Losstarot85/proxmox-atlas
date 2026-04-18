# ── Stage 1: Build React frontend ──
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Nginx with built static files ──
FROM nginx:alpine

RUN apk add --no-cache openssl

# Nginx configuration
COPY nginx/nginx.conf /etc/nginx/nginx.conf

# Self-signed cert generator (runs on startup if certs missing)
COPY nginx/generate-cert.sh /docker-entrypoint.d/10-generate-cert.sh
RUN chmod +x /docker-entrypoint.d/10-generate-cert.sh

# Copy built frontend from Stage 1
COPY --from=frontend-builder /app/dist /usr/share/nginx/html

EXPOSE 80 443
