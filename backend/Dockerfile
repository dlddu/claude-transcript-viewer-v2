# Build stage
FROM node:20-alpine AS build

# Enable corepack for pnpm
RUN corepack enable

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code and tsconfig
COPY . .

# Build TypeScript code
RUN pnpm build

# Production stage
FROM node:20-alpine

# Enable corepack for pnpm
RUN corepack enable

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy package files
COPY package.json pnpm-lock.yaml ./

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
