# Konkyo worker (plan S11): ingest, deep search, study sets, agents, briefs, connector sync.
# OCRmyPDF reads scanned PDFs; yt-dlp fetches YouTube captions. Build from the repository root:
#   docker build -f apps/worker/Dockerfile -t konkyo-worker .
FROM node:22.23.3-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ocrmypdf tesseract-ocr-eng python3-venv ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m venv /opt/yt-dlp \
  && /opt/yt-dlp/bin/pip install --no-cache-dir yt-dlp==2026.8.19 \
  && ln -s /opt/yt-dlp/bin/yt-dlp /usr/local/bin/yt-dlp
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter "@konkyo/worker..." --filter "@konkyo/cli..." \
  && mkdir -p /data && chown -R node:node /data /repo
ENV NODE_ENV=production KONKYO_ROOT=/data
USER node
CMD ["pnpm", "--filter", "@konkyo/worker", "start"]
