# =============================================================================
# Stage 1: base — shared pnpm + Node image
# =============================================================================
FROM node:22-alpine AS base

# Install pnpm via corepack (bundled with Node 22, no extra download needed)
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# =============================================================================
# Stage 2: deps — install ALL workspace dependencies (prod + dev)
# Scope: only manifests & lockfile so Docker layer cache is maximised
# =============================================================================
FROM base AS deps

# Copy monorepo manifests first (cache-friendly)
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY package.json ./

# Copy each workspace package manifest
COPY packages/shared-schema/package.json ./packages/shared-schema/
COPY apps/api/package.json                ./apps/api/

# Install everything (prod + dev) needed to build
RUN pnpm install --frozen-lockfile

# =============================================================================
# Stage 3: builder — compile TypeScript
# =============================================================================
FROM deps AS builder

# Copy full source after deps are installed (layer cache reused above)
COPY packages/shared-schema/ ./packages/shared-schema/
COPY apps/api/               ./apps/api/

# Build shared-schema first, then the API
RUN pnpm --filter @kendali/shared-schema build 2>/dev/null || true
RUN pnpm --filter kendali-be build:ts

# =============================================================================
# Stage 4: runner — lean production image
# Only compiled JS + production node_modules, no dev deps, no src
# =============================================================================
FROM base AS runner

# Install dumb-init for proper PID-1 / signal handling in containers
RUN apk add --no-cache dumb-init

# Run as non-root for security
RUN addgroup -S kendali && adduser -S kendali -G kendali
USER kendali

WORKDIR /app

# Copy pnpm store manifests (needed to prune)
COPY --chown=kendali:kendali pnpm-workspace.yaml pnpm-lock.yaml ./
COPY --chown=kendali:kendali package.json ./
COPY --chown=kendali:kendali packages/shared-schema/package.json ./packages/shared-schema/
COPY --chown=kendali:kendali apps/api/package.json               ./apps/api/

# Copy node_modules from builder, then prune to prod-only
COPY --chown=kendali:kendali --from=builder /app/node_modules          ./node_modules
COPY --chown=kendali:kendali --from=builder /app/apps/api/node_modules ./apps/api/node_modules

# Remove dev dependencies in-place
RUN pnpm prune --prod 2>/dev/null || true

# Copy compiled output
COPY --chown=kendali:kendali --from=builder /app/apps/api/dist              ./apps/api/dist
COPY --chown=kendali:kendali --from=builder /app/packages/shared-schema/dist ./packages/shared-schema/dist 2>/dev/null || true

# Volume mount point for SQLite data file (persists across container restarts)
VOLUME ["/app/apps/api/data"]

# Expose API port (default Fastify port, override via PORT env)
EXPOSE 3000

# Environment defaults (override at runtime with --env / Railway/Render env vars)
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Health-check: hit the /api/v1/health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/api/v1/health || exit 1

# Use dumb-init so Node receives SIGTERM cleanly (graceful shutdown)
ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "apps/api/dist/server.js"]
