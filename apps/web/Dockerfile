# check=skip=SecretsUsedInArgOrEnv (BETTER_AUTH_URL is the public address, not a secret)
# Konkyo web: the Next.js standalone server. Build from the repository root:
#   docker build -f apps/web/Dockerfile --build-arg BETTER_AUTH_URL=https://… -t konkyo-web .
FROM node:22.23.3-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter "@konkyo/web..."
# Static pages are rendered at build time, so their absolute links (Open Graph images) need the
# public address now. Secrets are not needed to build: env validation waits for the runtime.
ARG BETTER_AUTH_URL=http://localhost:3210
ENV SKIP_ENV_VALIDATION=1 BETTER_AUTH_URL=$BETTER_AUTH_URL
RUN pnpm --filter @konkyo/web build

FROM node:22.23.3-bookworm-slim AS run
# curl for the platform's HTTP health check (GET /api/health).
RUN apt-get update && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=3210 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1 \
    KONKYO_ROOT=/data
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
# Traces and the per-person memory and World Model files, shared with the worker.
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3210
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD curl -fsS http://127.0.0.1:3210/api/health || exit 1
# The heap stays under the container limit (set in Coolify), with room for native memory.
CMD ["node", "--max-old-space-size=768", "apps/web/server.js"]
