# ============================================================
# Stage 1: Base — Alpine Node + pnpm
# ============================================================
FROM node:22-alpine AS base

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@11.15.1 --activate

WORKDIR /app


# ============================================================
# Stage 2: Dependencies — install all workspace deps
# ============================================================
FROM base AS deps

# Copy workspace manifests first (layer caching)
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./

# Copy each app/package manifest for workspace linking
COPY apps/api/package.json ./apps/api/
COPY packages/shared-schema/package.json ./packages/shared-schema/

# Install all dependencies (including devDeps for build)
RUN pnpm install --frozen-lockfile


# ============================================================
# Stage 3: Builder — compile TypeScript
# ============================================================
FROM deps AS builder

# Copy shared package source
COPY packages/shared-schema/ ./packages/shared-schema/

# Copy API source
COPY apps/api/ ./apps/api/

# Build shared package first (if it has a build step)
RUN pnpm --filter @kendali/shared-schema run --if-present build

# Build the API (tsc → dist/)
RUN pnpm --filter api build:ts


# ============================================================
# Stage 4: Production deps only
# ============================================================
FROM base AS prod-deps

COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-schema/package.json ./packages/shared-schema/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod


# ============================================================
# Stage 5: Runner — lean production image
# ============================================================
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@11.15.1 --activate

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 fastify

WORKDIR /app

# Copy production node_modules from prod-deps stage
COPY --from=prod-deps /app/node_modules             ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules    ./apps/api/node_modules

# Copy compiled output
COPY --from=builder /app/apps/api/dist              ./apps/api/dist

# Copy package manifests needed at runtime
COPY --from=builder /app/apps/api/package.json      ./apps/api/package.json
COPY --from=builder /app/packages/shared-schema     ./packages/shared-schema

# Switch to non-root user
USER fastify

WORKDIR /app/apps/api

# Expose API port (default Fastify port)
EXPOSE 3000

# Health-check — adjust path/port to match your actual health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Start the compiled app
CMD ["node", "dist/server.js"]
