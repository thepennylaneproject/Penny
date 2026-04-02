# Build stage — keep in sync with repo layout (next.config.ts, hooks/, middleware, etc.)
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

# Full source (see .dockerignore); previously missed hooks/, middleware, configs → broken builds
COPY . .

RUN npm run build

# Runtime stage
FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache tini

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "start"]

# Busybox wget is available on Alpine
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:3000/api/health || exit 1

LABEL org.opencontainers.image.title="penny Dashboard" \
      org.opencontainers.image.description="Web dashboard for the penny code quality platform" \
      org.opencontainers.image.vendor="The Penny Lane Project" \
      org.opencontainers.image.version="1.0.0"
