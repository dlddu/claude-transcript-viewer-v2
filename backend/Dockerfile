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

# Cache dependency builds by copying Cargo manifests first
COPY backend/Cargo.toml backend/Cargo.lock* ./
RUN mkdir -p src tests \
    && echo "fn main() {}" > src/main.rs \
    && echo "" > src/lib.rs \
    && cargo build --release --locked 2>/dev/null || cargo build --release \
    && rm -rf src tests target/release/deps/claude_transcript_viewer_backend* target/release/deps/backend-*

# Copy the actual sources and build
COPY backend/src ./src
COPY backend/tests ./tests

RUN cargo build --release --locked 2>/dev/null || cargo build --release

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

COPY --from=build /app/target/release/claude-transcript-viewer-backend /usr/local/bin/claude-transcript-viewer-backend

USER appuser

EXPOSE 3000

CMD ["/usr/local/bin/claude-transcript-viewer-backend"]
