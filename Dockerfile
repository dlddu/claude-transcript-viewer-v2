# Single-image build: the Go backend serves both the API and the static
# frontend bundle, so one container runs the whole application.

# Frontend build stage
FROM node:20-alpine AS frontend-build

# Enable corepack and install correct pnpm version
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

# Copy workspace configuration and all package.json files for proper lockfile resolution
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/
COPY e2e/package.json ./e2e/

# Install dependencies for frontend
RUN pnpm install --frozen-lockfile --filter @claude-transcript-viewer/frontend...

# Copy frontend source code
COPY frontend/ ./frontend/

# Build without VITE_API_URL so the bundle calls the API on the same origin
# that serves it (this container).
WORKDIR /app/frontend
RUN pnpm build

# Backend build stage
FROM golang:1.24-alpine AS backend-build

WORKDIR /src

# Cache module downloads.
COPY backend/go.mod backend/go.sum ./
RUN go mod download

# Copy source and build a static binary.
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server .

# Runtime stage
FROM alpine:3.20

RUN addgroup -S app -g 1000 \
    && adduser -S -G app -u 1000 -s /sbin/nologin app \
    && mkdir -p /data \
    && chown app:app /data

# CA bundle for outbound TLS (S3); copied from the build stage so the runtime
# stage needs no package installs.
COPY --from=backend-build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=backend-build /out/server /usr/local/bin/server
COPY --from=frontend-build /app/frontend/dist /app/static

# SQLite session-mapping database. In Kubernetes this path is backed by a
# PersistentVolumeClaim; the image dir is a writable fallback for local runs.
ENV DB_PATH=/data/transcripts.db

# Built frontend served by the Go server on non-/api routes.
ENV STATIC_DIR=/app/static

USER app
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/server"]
