FROM node:22-alpine

ARG CODEX_CLI_VERSION=0.130.0

WORKDIR /app

RUN apk add --no-cache bash ca-certificates git

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
RUN npm install -g "@openai/codex@${CODEX_CLI_VERSION}" && npm cache clean --force

COPY convex ./convex
COPY shared ./shared
COPY services/polynet-codex-worker ./services/polynet-codex-worker

RUN chmod +x /app/services/polynet-codex-worker/entrypoint.sh && mkdir -p /app/agent-cwd

ENV NODE_ENV=production
ENV PORT=8787
ENV POLYNET_DEPLOYMENT_KIND=staging
ENV CONVEX_DEPLOYMENT=dev:quick-porcupine-949
ENV POLYNET_WORKSPACE_COMPUTER_PROVIDER=blaxel
ENV POLYNET_ENABLE_BLAXEL_WORKSPACE_PROVIDER=true
ENV POLYNET_CODEX_WORKER_HOST=0.0.0.0
ENV POLYNET_CODEX_WORKER_CODEX_BIN=codex
ENV POLYNET_CODEX_WORKER_MODEL=gpt-5.5
ENV POLYNET_CODEX_WORKER_COMMAND_TIMEOUT_SECONDS=60
ENV CODEX_HOME=/data/codex-home
ENV POLYNET_CODEX_WORKER_AGENT_CWD=/app/agent-cwd

EXPOSE 8787

CMD ["/app/services/polynet-codex-worker/entrypoint.sh"]
