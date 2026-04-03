# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies (pnpm included in case Railway injects pnpm scripts)
RUN apk add --no-cache python3 make g++ && npm install -g pnpm

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Runtime stage
FROM node:22-alpine

WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache tini git

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm install --omit=dev && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

# Use tini to handle signals properly
ENTRYPOINT ["/sbin/tini", "--"]

# Start the worker
CMD ["node", "dist/index.js"]

# Health check (optional - requires the worker to expose a status endpoint)
# HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
#   CMD node -e "process.exit(0)" || exit 1

# Metadata
LABEL org.opencontainers.image.title="penny Worker" \
      org.opencontainers.image.description="Audit job processor for the penny code quality platform" \
      org.opencontainers.image.vendor="The Penny Lane Project" \
      org.opencontainers.image.version="1.0.0"
