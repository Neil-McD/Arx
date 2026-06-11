import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const bridge = read("convex/polynetCodexWorkerBridge.ts");
const stagingFlyToml = read("services/polynet-codex-worker/fly.toml");
const productionFlyToml = read("services/polynet-codex-worker/fly.production.toml");
const stagingDeployScript = read("scripts/deploy_polynet_codex_worker_fly_staging.sh");
const productionDeployScript = read("scripts/deploy_polynet_codex_worker_fly_production.sh");
const productionGuard = read("scripts/polynet_codex_worker_production_guard.sh");
const productionStaticAcceptance = read("scripts/polynet_codex_worker_production_static_acceptance_gate.sh");
const productionAcceptance = read("scripts/polynet_codex_worker_production_acceptance_gate.sh");
const packageJson = read("package.json");

assert.match(
  productionFlyToml,
  /app = "polynet-codex-worker"/,
  "production Fly config must target the production worker app",
);
assert.match(
  productionFlyToml,
  /POLYNET_DEPLOYMENT_KIND = "production"[\s\S]*CONVEX_DEPLOYMENT = "prod:wry-hawk-715"/,
  "production Fly config must point at production deployment state",
);
assert.match(
  productionFlyToml,
  /internal_port = 8787[\s\S]*force_https = true[\s\S]*auto_stop_machines = "suspend"[\s\S]*min_machines_running = 0/,
  "production Fly http service must keep the proven autosuspend shape",
);
assert.match(
  productionFlyToml,
  /\[http_service\.concurrency\][\s\S]*soft_limit = 1[\s\S]*hard_limit = 16/,
  "production Fly concurrency must keep single-flight routing semantics",
);
assert.match(
  productionFlyToml,
  /cpus = 1[\s\S]*memory_mb = 1024/,
  "production Fly machines must keep the proven 1CPU/1GB worker profile",
);
assert.doesNotMatch(
  productionFlyToml,
  /polynet-codex-worker-staging|quick-porcupine-949|POLYNET_DEPLOYMENT_KIND = "staging"/,
  "production Fly config must not contain staging app or staging Convex state",
);

assert.match(stagingFlyToml, /app = "polynet-codex-worker-staging"/, "staging Fly app must stay staging");
assert.match(
  stagingFlyToml,
  /POLYNET_DEPLOYMENT_KIND = "staging"[\s\S]*CONVEX_DEPLOYMENT = "dev:quick-porcupine-949"/,
  "staging Fly env must stay on the staging Convex deployment",
);
assert.doesNotMatch(stagingFlyToml, /prod:wry-hawk-715|app = "polynet-codex-worker"/, "staging Fly config must not target prod");

assert.match(
  productionDeployScript,
  /fly\.production\.toml[\s\S]*POLYNET_DEPLOYMENT_KIND="\$\{POLYNET_DEPLOYMENT_KIND:-production\}"[\s\S]*CONVEX_DEPLOYMENT="\$\{CONVEX_DEPLOYMENT:-prod:wry-hawk-715\}"/,
  "production deploy script must default to production deployment state",
);
assert.match(
  productionDeployScript,
  /polynet_codex_worker_production_guard\.sh[\s\S]*if \[\[ "\$APP_NAME" != "polynet-codex-worker" \]\]/,
  "production deploy script must run the production guard and refuse non-production app names",
);
assert.match(
  productionDeployScript,
  /POLYNET_CODEX_WORKER_AUTH_TOKEN is required[\s\S]*BL_WORKSPACE and BL_API_KEY are required[\s\S]*auth_secret_count[\s\S]*-gt 1/,
  "production deploy script must require worker, Blaxel, and exactly-one Codex auth secret",
);
assert.match(
  productionDeployScript,
  /deploy --config "\$CONFIG_FILE" --remote-only --ha=false/,
  "production deploy must use remote Fly build and avoid spare HA machines until queue routing owns scale",
);
assert.doesNotMatch(
  productionDeployScript,
  /dev:quick-porcupine-949|polynet-codex-worker-staging/,
  "production deploy script must not contain staging targets",
);

assert.match(
  productionGuard,
  /FORBIDDEN_STAGING_ROOT="\/Users\/neilmcdevitt\/code\/arx-polynet-codex-worker"[\s\S]*EXPECTED_CONVEX_DEPLOYMENT="prod:wry-hawk-715"/,
  "production guard must reject the staging worktree and require prod Convex",
);
assert.match(
  productionGuard,
  /FORBIDDEN_STAGING_BRANCH_PREFIX="codex\/polynet-owned-codex-worker-"[\s\S]*EXPECTED_FLY_APP="polynet-codex-worker"/,
  "production guard must reject the staging branch family and require the production Fly app",
);
assert.match(
  productionGuard,
  /EXPECTED_FLY_CONFIG_SUFFIX="services\/polynet-codex-worker\/fly\.production\.toml"[\s\S]*refusing staging Vercel project link/,
  "production guard must require production Fly config and reject staging Vercel linkage",
);

assert.match(
  bridge,
  /POLYNET_CODEX_WORKER_ALLOWED_DEPLOYMENT_KINDS[\s\S]*"staging"[\s\S]*"production"/,
  "bridge must allow only staging and production deployment kinds",
);
assert.match(
  bridge,
  /POLYNET_CODEX_WORKER_RUNTIME_ENABLED[\s\S]*readWorkerDeploymentKind\(\)[\s\S]*POLYNET_CODEX_WORKER_URL[\s\S]*POLYNET_CODEX_WORKER_AUTH_TOKEN/,
  "bridge must stay feature-flagged and configured only by server env",
);
assert.match(
  bridge,
  /deploymentKind === "production"[\s\S]*staging\|quick-porcupine-949[\s\S]*polynet_codex_worker_production_env_mismatch/,
  "bridge must reject production worker URLs that still look like staging",
);
assert.match(
  bridge,
  /wry-hawk-715\|www\\\.polynet\\\.ai\|polynet-codex-worker\\\.fly\\\.dev[\s\S]*polynet_codex_worker_staging_env_mismatch/,
  "bridge must reject staging worker URLs that look like production",
);

assert.match(
  stagingDeployScript,
  /polynet_codex_worker_staging_guard\.sh[\s\S]*polynet-codex-worker-staging/,
  "staging deploy path must remain guarded and staging-specific",
);
assert.match(
  packageJson,
  /"check:polynet-codex-worker-production"[\s\S]*"check:polynet-codex-worker-production-static-acceptance"[\s\S]*"check:polynet-codex-worker-production-acceptance"[\s\S]*"check:polynet-codex-worker-fly-production-config"[\s\S]*"deploy:polynet-codex-worker-fly-production"/,
  "package scripts must expose production guard, static acceptance, final live acceptance, config proof, and deploy command",
);
assert.match(
  productionStaticAcceptance,
  /production static acceptance[\s\S]*git diff --check[\s\S]*check:polynet-codex-worker-production[\s\S]*check:polynet-codex-worker-fly-production-config[\s\S]*check:polynet-codex-worker-convex-bridge-contract[\s\S]*preflight:workspace-provider-pointers:prod[\s\S]*preflight:workspace-included-credits:prod[\s\S]*check:web-typecheck[\s\S]*npm run --silent build[\s\S]*STATIC STAGES PASS/,
  "static production acceptance must remain non-live and cover the static release proof set",
);
assert.doesNotMatch(
  productionStaticAcceptance,
  /check:polynet-codex-worker-fly-production-contract|POLYNET_PRODUCTION_ACCEPTANCE_REMOTE/,
  "static production acceptance must not run or require the live Fly production proof",
);
assert.match(
  productionAcceptance,
  /POLYNET_PRODUCTION_ACCEPTANCE_REMOTE:-\}" != "true"[\s\S]*final production acceptance requires live remote proof[\s\S]*check:polynet-codex-worker-production-static-acceptance[\s\S]*check:polynet-codex-worker-fly-production-contract[\s\S]*ALL STATIC AND LIVE STAGES PASS/,
  "final production acceptance must fail closed unless live remote proof is enabled, then run static plus live Fly proof",
);
assert.doesNotMatch(
  productionAcceptance,
  /remote stage skipped|STATIC STAGES PASS/,
  "final production acceptance must not contain a passing path that skips live remote proof",
);

console.log("polynet_codex_worker_fly_production_config_proof: ok");
