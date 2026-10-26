# Konkyo docs: the static export, served by nginx. Build from the repository root:
#   docker build -f apps/docs/Dockerfile -t konkyo-docs .
FROM node:22.23.3-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
COPY . .
# The docs need none of the app's packages (and so none of its install scripts).
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter "@konkyo/docs..." --ignore-scripts
RUN pnpm --filter @konkyo/docs build

FROM nginx:1.27.5-alpine
COPY apps/docs/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/docs/out /usr/share/nginx/html
EXPOSE 80
