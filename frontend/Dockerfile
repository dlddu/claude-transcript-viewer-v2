# Build stage
FROM node:20-alpine AS build

# Enable corepack for pnpm
RUN corepack enable

WORKDIR /app

# Copy lockfile from monorepo root and frontend package.json
COPY pnpm-lock.yaml ./
COPY frontend/package.json ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy frontend source code
COPY frontend/ ./

# Build the application
RUN pnpm build

# Production stage
FROM nginx:alpine

# Copy built files from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# nginx:alpine already runs as nginx user by default
# Start nginx
CMD ["nginx", "-g", "daemon off;"]
