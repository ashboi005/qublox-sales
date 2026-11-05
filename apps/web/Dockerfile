FROM node:24-bookworm-slim AS build
COPY --from=oven/bun:1.3.10 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile --ignore-scripts
# The browser uses relative URLs; no private server configuration is needed to build.
ENV NEXT_PUBLIC_SERVER_URL=http://localhost:3001
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run env:generate
RUN cd apps/web && bun run build
RUN mkdir -p apps/web/public

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3001
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
# Varlock auto-load needs its CLI and installed dependency graph at runtime.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/web/.env.schema ./apps/web/.env.schema
USER node
WORKDIR /app/apps/web
EXPOSE 3001
CMD ["node", "--import", "varlock/auto-load", "server.js"]
