# Konkyo worker: ingest, deep search, study sets, agents, briefs, connector sync.
# Build from the repository root:   docker build -f apps/worker/Dockerfile .
#
#   build:   install the worker's workspace, bundle its TypeScript (it and every @konkyo package) to
#            JavaScript once (scripts/build.mjs), then `pnpm deploy` a production install.
#   runtime: the bundle, production node_modules and the migrations, run by `node` as PID 1: no
#            TypeScript compiled at runtime, a heap set under the container's memory limit. OCRmyPDF
#            reads scanned PDFs; yt-dlp fetches YouTube captions.
FROM node:22.23.3-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=1
RUN corepack enable
WORKDIR /app
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter "@konkyo/worker..."
# The check fails the build if the flat install holds a different version of a package than the
# bundle was built against (scripts/build.mjs --check).
RUN pnpm --filter @konkyo/worker build \
  && pnpm --filter @konkyo/worker deploy --prod --legacy --config.node-linker=hoisted /out \
  && node apps/worker/scripts/build.mjs --check /out

FROM node:22.23.3-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ocrmypdf tesseract-ocr-eng python3-venv ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m venv /opt/yt-dlp \
  && /opt/yt-dlp/bin/pip install --no-cache-dir yt-dlp==2026.8.19 \
  && ln -s /opt/yt-dlp/bin/yt-dlp /usr/local/bin/yt-dlp
ENV NODE_ENV=production KONKYO_ROOT=/data
# The bundle finds the migrations the way the source did (packages/db/drizzle from the repo root).
WORKDIR /app/apps/worker
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /app/apps/worker/dist ./dist
COPY --from=build /app/packages/db/drizzle /app/packages/db/drizzle
RUN mkdir -p /data /evidence && chown node:node /data /evidence
USER node
# The heap stays under the container's limit (set in Coolify) with room for native memory.
CMD ["node", "--max-old-space-size=1280", "--enable-source-maps", "--import", "./dist/bundle/register.mjs", "dist/bundle/main.mjs"]
