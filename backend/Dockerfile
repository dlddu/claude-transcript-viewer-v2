# Build stage
FROM node:20-alpine AS build

# Enable corepack and install correct pnpm version
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

# Copy workspace configuration and all package.json files for proper lockfile resolution
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
COPY e2e/package.json ./e2e/

# Install all dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile --filter @claude-transcript-viewer/backend...

# Copy backend source code
COPY backend/ ./backend/

# Build TypeScript code
WORKDIR /app/backend
RUN pnpm build

# Production stage
FROM node:20-alpine

# Enable corepack and install correct pnpm version
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy workspace configuration and all package.json files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
COPY e2e/package.json ./e2e/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile --filter @claude-transcript-viewer/backend...

# Copy built files from build stage
COPY --from=build /app/backend/dist ./backend/dist

# Use non-root user
USER node

# Expose port 3000
EXPOSE 3000

# Start the application
CMD ["node", "backend/dist/index.js"]
