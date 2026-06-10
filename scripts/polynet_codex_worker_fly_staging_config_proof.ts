import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const dockerfile = read("services/polynet-codex-worker/Dockerfile");
const entrypoint = read("services/polynet-codex-worker/entrypoint.sh");
const flyToml = read("services/polynet-codex-worker/fly.toml");
const deployScript = read("scripts/deploy_polynet_codex_worker_fly_staging.sh");
const remoteProof = read("scripts/polynet_codex_worker_fly_staging_contract_proof.ts");

assert.match(
  dockerfile,
  /ARG CODEX_CLI_VERSION=0\.130\.0[\s\S]*npm install -g "@openai\/codex@\$\{CODEX_CLI_VERSION\}"/,
  "Fly image must pin the locally proven Codex CLI package version",
);
assert.match(
  dockerfile,
  /COPY convex \.\/convex[\s\S]*COPY shared \.\/shared[\s\S]*COPY services\/polynet-codex-worker \.\/services\/polynet-codex-worker/,
  "Fly image must include the worker, Convex Blaxel provider, and shared runtime imports",
);
assert.match(
  dockerfile,
  /ENV POLYNET_CODEX_WORKER_HOST=0\.0\.0\.0[\s\S]*ENV POLYNET_CODEX_WORKER_MODEL=gpt-5\.5[\s\S]*ENV CODEX_HOME=\/data\/codex-home/,
  "Fly image must bind remotely, default to gpt-5.5, and isolate Codex home",
);
assert.doesNotMatch(
  dockerfile,
  /COPY AGENTS\.md/,
  "Fly image must not bake the repo AGENTS.md dev contract into user-facing Codex turns",
);
assert.match(
  dockerfile,
  /mkdir -p \/app\/agent-cwd[\s\S]*ENV POLYNET_CODEX_WORKER_AGENT_CWD=\/app\/agent-cwd/,
  "Codex must run from an empty agent cwd so local source and project docs stay out of turns",
);

assert.match(
  entrypoint,
  /config\.toml[\s\S]*model = "\$\{POLYNET_CODEX_WORKER_MODEL:-gpt-5\.5\}"[\s\S]*approval_policy = "never"[\s\S]*project_doc_max_bytes = 0/,
  "entrypoint must pin Codex defaults: gpt-5.5 model, no approvals, project docs disabled",
);
assert.match(
  entrypoint,
  /CODEX_AUTH_JSON_BASE64[\s\S]*codex login --with-access-token[\s\S]*codex login --with-api-key/,
  "entrypoint must support file, Codex access token, and API-key auth secret paths",
);
assert.match(
  entrypoint,
  /unset CODEX_AUTH_JSON_BASE64[\s\S]*unset CODEX_ACCESS_TOKEN[\s\S]*unset OPENAI_API_KEY/,
  "entrypoint must remove auth material from the worker process environment after login",
);
assert.match(
  entrypoint,
  /POLYNET_CODEX_WORKER_AUTH_TOKEN is required[\s\S]*BL_WORKSPACE and BL_API_KEY are required/,
  "entrypoint must fail closed on missing worker auth or Blaxel credentials",
);

assert.match(flyToml, /app = "polynet-codex-worker-staging"/, "Fly app must be staging-only");
assert.match(flyToml, /primary_region = "sjc"/, "Fly worker should use an active West Coast region near Blaxel us-pdx-1");
assert.match(flyToml, /dockerfile = "Dockerfile"/, "Nested Fly config must use a Dockerfile path relative to fly.toml");
assert.match(
  flyToml,
  /POLYNET_DEPLOYMENT_KIND = "staging"[\s\S]*CONVEX_DEPLOYMENT = "dev:quick-porcupine-949"/,
  "Fly env must point at staging deployment state",
);
assert.match(
  flyToml,
  /internal_port = 8787[\s\S]*force_https = true[\s\S]*auto_stop_machines = "suspend"[\s\S]*min_machines_running = 0/,
  "Fly http service must autosuspend to avoid idle worker billing",
);
assert.match(
  flyToml,
  /\[http_service\.concurrency\][\s\S]*soft_limit = 8[\s\S]*hard_limit = 16/,
  "Fly must pass concurrent requests through so the worker can return 409 instead of proxy-queueing",
);
assert.match(flyToml, /memory_mb = 4096/, "Fly staging proof must use 4GB memory");
assert.match(
  flyToml,
  /BLAXEL_WORKSPACE_MEMORY_MB = "2048"/,
  "Blaxel staging execution sandbox must default to 2GB for the worker proof",
);
assert.doesNotMatch(flyToml, /wry-hawk-715|www\.polynet\.ai|app = "polynet"/, "Fly config must not target prod");
assert.match(
  deployScript,
  /deploy --config "\$CONFIG_FILE" --remote-only --ha=false/,
  "staging deploy must not create spare Fly machines until Convex owns queue routing",
);
assert.match(
  deployScript,
  /create_args\+=\("--org" "\$\{FLY_ORG:-polynet\}"\)[\s\S]*apps create "\$\{create_args\[@\]\}"/,
  "staging app creation must use the polynet org in non-interactive Fly CLI mode",
);

assert.match(
  remoteProof,
  /https:\/\/polynet-codex-worker-staging\.fly\.dev[\s\S]*POLYNET_CODEX_WORKER_AUTH_TOKEN is required/,
  "remote proof must target staging and require bearer auth",
);
assert.match(
  remoteProof,
  /run_model_finished[\s\S]*run_finalized[\s\S]*sandbox_destroy_ms/,
  "remote proof must assert final lifecycle timing",
);

console.log("polynet_codex_worker_fly_staging_config_proof: ok");
