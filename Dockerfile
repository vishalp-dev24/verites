# Multi-stage build for Veritas API
FROM node:22-alpine AS base

# Install build dependencies
RUN apk add --no-cache \
  python3 \
  make \
  g++ \
  openssl

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including dev dependencies for build)
FROM base AS deps
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Build stage
FROM deps AS build
COPY . .
RUN npm run build

# Production stage - minimal image
FROM node:22-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache \
  dumb-init \
  openssl

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy necessary files from build stage
COPY --from=build --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist
COPY --from=build --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nodejs:nodejs /app/package.json ./

# Create necessary directories
RUN mkdir -p logs && chown nodejs:nodejs logs

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/app.js"]
