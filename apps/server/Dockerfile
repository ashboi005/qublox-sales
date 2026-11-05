FROM oven/bun:1.3.10 AS build
WORKDIR /app
COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile --ignore-scripts
RUN bun run env:generate
RUN cd apps/server && bun run build

FROM oven/bun:1.3.10 AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Keep workspace sources and drizzle-kit for the same-image migration service.
COPY --from=build --chown=bun:bun /app /app
USER bun
WORKDIR /app/apps/server
EXPOSE 3000
CMD ["bun", "dist/index.mjs"]
