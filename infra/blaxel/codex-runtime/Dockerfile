FROM node:22-bookworm-slim

ARG CODEX_NPM_VERSION=0.137.0

ENV DEBIAN_FRONTEND=noninteractive \
    HOME=/home/codex \
    CODEX_HOME=/home/codex/.codex \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NO_COLOR=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    bubblewrap \
    ca-certificates \
    curl \
    git \
    jq \
    openssh-client \
    procps \
    python3 \
    python3-pip \
    ripgrep \
    sudo \
  && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/blaxel-ai/sandbox:latest /sandbox-api /usr/local/bin/sandbox-api

RUN npm install -g "@openai/codex@${CODEX_NPM_VERSION}" \
  && codex --version

RUN useradd --create-home --shell /bin/bash codex \
  && mkdir -p /workspace /home/codex/.codex /home/codex/.cache/npm \
  && printf 'codex ALL=(ALL) NOPASSWD:ALL\n' > /etc/sudoers.d/codex \
  && chmod 0440 /etc/sudoers.d/codex \
  && chown -R codex:codex /workspace /home/codex

COPY --chown=codex:codex codex-config.toml /home/codex/.codex/config.toml
COPY --chown=codex:codex entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER codex
WORKDIR /workspace

RUN command -v codex \
  && codex --version \
  && command -v sandbox-api \
  && test -f /home/codex/.codex/config.toml

ENTRYPOINT ["/entrypoint.sh"]
CMD ["sleep", "infinity"]
