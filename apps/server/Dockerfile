FROM oven/bun:1.3.10 AS build
WORKDIR /app
COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile --ignore-scripts
RUN bun run env:generate
RUN cd apps/server && bun run build

# Production dependencies of the API/worker only (plus drizzle-kit for the migrate service).
# The full workspace install is about 730 MB; this keeps the image small enough to deploy
# repeatedly on a small VPS.
FROM oven/bun:1.3.10 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/auth/package.json packages/auth/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,target=/root/.bun/install/cache \
  bun install --production --omit=peer --frozen-lockfile --ignore-scripts --filter server

FROM oven/bun:1.3.10 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps --chown=bun:bun /app /app
# Bundled API and worker.
COPY --from=build --chown=bun:bun /app/apps/server/dist apps/server/dist
COPY --from=build --chown=bun:bun /app/apps/server/.env.schema apps/server/
# Small sources for migrations (drizzle-kit reads the schema and SQL) and the team CLI.
COPY --from=build --chown=bun:bun /app/apps/server/src apps/server/src
COPY --from=build --chown=bun:bun /app/apps/server/tsconfig.json apps/server/
COPY --from=build --chown=bun:bun /app/packages/db/src packages/db/src
COPY --from=build --chown=bun:bun /app/packages/db/drizzle.config.ts /app/packages/db/.env.schema /app/packages/db/tsconfig.json packages/db/
COPY --from=build --chown=bun:bun /app/packages/auth/src packages/auth/src
COPY --from=build --chown=bun:bun /app/packages/shared/src packages/shared/src
COPY --from=build --chown=bun:bun /app/packages/config packages/config
COPY --from=build --chown=bun:bun /app/tsconfig.json ./
USER bun
WORKDIR /app/apps/server
EXPOSE 3000
CMD ["bun", "dist/index.mjs"]
