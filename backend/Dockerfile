# Build stage - compile the Rust backend
# Need Rust 1.85+ for edition2024 (used by transitive deps such as time-macros)
FROM rust:1.94-slim-bookworm AS build

# Install build dependencies for the AWS SDK (uses aws-lc-rs which needs cmake)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       pkg-config \
       cmake \
       libssl-dev \
       ca-certificates \
       build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/Cargo.toml backend/Cargo.lock ./
COPY backend/src ./src
COPY backend/tests ./tests

# Build the release binary. Docker layer caching keyed on the COPY layers above
# already gives us reasonable rebuild caching when sources don't change. Using a
# BuildKit cache mount keeps the cargo registry warm across builds.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo build --release --locked \
    && cp /app/target/release/claude-transcript-viewer-backend /usr/local/bin/claude-transcript-viewer-backend

# Runtime stage - minimal Debian image with just the binary
FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates \
       curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1000 appuser \
    && useradd --system --uid 1000 --gid appuser --shell /sbin/nologin appuser

WORKDIR /app

COPY --from=build /usr/local/bin/claude-transcript-viewer-backend /usr/local/bin/claude-transcript-viewer-backend

USER appuser

EXPOSE 3000

CMD ["/usr/local/bin/claude-transcript-viewer-backend"]
