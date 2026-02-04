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

# Install dependencies for frontend
RUN pnpm install --frozen-lockfile --filter @claude-transcript-viewer/frontend...

# Copy frontend source code
COPY frontend/ ./frontend/

# Build the application
WORKDIR /app/frontend
RUN pnpm build

# Production stage
FROM nginx:alpine

# Copy built files from build stage
COPY --from=build /app/frontend/dist /usr/share/nginx/html

# Copy nginx configuration
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# nginx:alpine already runs as nginx user by default
# Start nginx
CMD ["nginx", "-g", "daemon off;"]
