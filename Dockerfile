
FROM node:20-alpine AS frontend-build

RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/
COPY e2e/package.json ./e2e/

RUN pnpm install --frozen-lockfile --filter @claude-transcript-viewer/frontend...

COPY frontend/ ./frontend/

# Build without VITE_API_URL so the bundle calls the API on the same origin
# that serves it (this container).
WORKDIR /app/frontend
RUN pnpm build

FROM golang:1.24-alpine AS backend-build

WORKDIR /src

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server .

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

ENV STATIC_DIR=/app/static

USER app
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/server"]
