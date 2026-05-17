default: test

install:
    pnpm install
    cd backend && cargo fetch

test:
    pnpm -r test:unit
    cd backend && cargo test --lib

test-integration:
    cd backend && cargo test --test integration -- --test-threads=1

test-e2e:
    pnpm --filter @claude-transcript-viewer/e2e test

build:
    pnpm -r build
    cd backend && cargo build --release

lint:
    pnpm -r lint
    cd backend && cargo fmt --check && cargo clippy --all-targets -- -D warnings

dev-backend:
    cd backend && cargo run

dev-frontend:
    pnpm --filter @claude-transcript-viewer/frontend dev
