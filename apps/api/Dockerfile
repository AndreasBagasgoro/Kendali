# ============================================================
# Stage 1: Base
# ============================================================
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# ============================================================
# Stage 2: Dependencies (install semua, termasuk dev, untuk build)
# ============================================================
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared-schema/package.json packages/shared-schema/
RUN pnpm --dir apps/api install --frozen-lockfile

# ============================================================
# Stage 3: Builder
# ============================================================
FROM deps AS builder
COPY . ./
RUN pnpm --dir apps/api build:ts

# ============================================================
# Stage 4: Deploy — flatten deps tanpa symlink menggunakan pnpm deploy
# ============================================================
FROM builder AS deployer
RUN pnpm --filter api deploy --prod --legacy /app/deployed

# ============================================================
# Stage 5: Runner — lean production image
# ============================================================
FROM node:22-alpine AS runner
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 fastify
WORKDIR /app

# Copy deployed output (real files, no symlinks)
COPY --from=deployer /app/deployed/node_modules ./node_modules
COPY --from=deployer /app/deployed/dist ./dist
COPY --from=deployer /app/deployed/package.json ./package.json

USER fastify
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

CMD ["node", "node_modules/fastify-cli/cli.js", "start", "-l", "info", "-a", "0.0.0.0", "dist/app.js"]