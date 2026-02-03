# Build stage
FROM node:20-alpine AS build

# Enable corepack and install correct pnpm version
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

# Copy lockfile from monorepo root and backend package.json
COPY pnpm-lock.yaml ./
COPY backend/package.json ./

# Install all dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile

# Copy backend source code and tsconfig
COPY backend/ ./

# Build TypeScript code
RUN pnpm build

# Production stage
FROM node:20-alpine

# Enable corepack and install correct pnpm version
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy lockfile from monorepo root and backend package.json
COPY pnpm-lock.yaml ./
COPY backend/package.json ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built files from build stage
COPY --from=build /app/dist ./dist

# Use non-root user
USER node

# Expose port 3000
EXPOSE 3000

# Start the application
CMD ["node", "dist/index.js"]
