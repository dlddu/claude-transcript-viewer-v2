# Build stage
FROM golang:1.24-alpine AS build

WORKDIR /src

# Cache module downloads.
COPY backend/go.mod backend/go.sum ./
RUN go mod download

# Copy source and build a static binary.
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server .

# Runtime stage
FROM alpine:3.20

RUN apk add --no-cache ca-certificates \
    && addgroup -S app -g 1000 \
    && adduser -S -G app -u 1000 -s /sbin/nologin app \
    && mkdir -p /data \
    && chown app:app /data

COPY --from=build /out/server /usr/local/bin/server

# SQLite session-mapping database. In Kubernetes this path is backed by a
# PersistentVolumeClaim; the image dir is a writable fallback for local runs.
ENV DB_PATH=/data/transcripts.db

USER app
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/server"]
