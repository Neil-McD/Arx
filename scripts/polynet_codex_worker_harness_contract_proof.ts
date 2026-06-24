import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

function exists(path: string): boolean {
  return existsSync(resolve(root, path));
}

const packageJson = read("package.json");
const schema = read("convex/schema.ts");
const server = read("services/polynet-codex-worker/src/server.ts");
const appServerClient = read("services/polynet-codex-worker/src/codexAppServerClient.ts");
const daytonaConfig = read("services/polynet-codex-worker/src/daytonaCodexConfig.ts");
const daytonaLocalWorkspace = read("services/polynet-codex-worker/src/daytonaLocalWorkspaceTool.ts");
const workerToolSpecs = read("services/polynet-codex-worker/src/workerToolSpecs.ts");
const workerText = read("services/polynet-codex-worker/src/workerText.ts");
const admission = read("convex/polynetCodexWorkerAdmission.ts");
const ingest = read("convex/polynetCodexWorkerIngest.ts");
const runToken = read("convex/polynetCodexWorkerRunToken.ts");
const terminal = read("convex/polynetCodexWorkerTerminal.ts");
const tool = read("convex/polynetCodexWorkerTool.ts");
const limits = read("shared/polynetCodexWorkerLimits.ts");
const runner = read("scripts/run_polynet_codex_worker_service_local.sh");

assert.equal(
  exists("services/polynet-codex-worker/src/codexStdioAppServerClient.ts"),
  false,
  "temporary stdio worker adapter must be deleted after full Daytona worker lands.",
);
assert.equal(
  exists("scripts/polynet_codex_worker_codex_stdio_contract_proof.ts"),
  false,
  "temporary stdio contract proof must be deleted.",
);
assert.equal(
  exists("scripts/polynet_codex_worker_codex_stdio_live_smoke.ts"),
  false,
  "temporary stdio live smoke must be deleted.",
);
assert.equal(
  exists("scripts/polynet_codex_worker_end_to_end_contract_proof.ts"),
  false,
  "old minimal worker e2e proof must be deleted.",
);

assert.match(
  packageJson,
  /"check:polynet-codex-worker-service-contract-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/polynet_codex_worker_service_contract_proof\.ts"/,
  "package.json must keep the canonical worker service proof entrypoint.",
);
assert.match(
  packageJson,
  /"check:polynet-codex-worker-harness-contract-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/polynet_codex_worker_harness_contract_proof\.ts"/,
  "package.json must expose this focused worker harness proof.",
);
assert.match(
  packageJson,
  /"dev:polynet-codex-worker": "bash scripts\/run_polynet_codex_worker_service_local\.sh"/,
  "package.json must expose the local Daytona worker runner.",
);
assert.doesNotMatch(
  packageJson,
  /polynet-codex-worker-codex-stdio|polynet-codex-worker-e2e-contract-proof/,
  "package scripts must not advertise stale stdio/minimal worker checks.",
);

assert.match(
  schema,
  /polynetCodexWorkerCapacityLeases: defineTable\(\{[\s\S]*status: v\.union\([\s\S]*v\.literal\("active"\)[\s\S]*v\.literal\("released"\)[\s\S]*v\.literal\("expired"\)[\s\S]*\.index\("by_status_expiresAt"[\s\S]*\.index\("by_owner_status_expiresAt"[\s\S]*\.index\("by_project_status_expiresAt"/,
  "schema must define first-class Codex worker capacity leases.",
);

assert.match(
  limits,
  /POLYNET_CODEX_WORKER_PROJECT_CONCURRENT_RUN_LIMIT = 5[\s\S]*POLYNET_CODEX_WORKER_DEPLOYMENT_CONCURRENT_RUN_LIMIT = 10[\s\S]*POLYNET_CODEX_WORKER_USER_CONCURRENT_RUN_LIMIT = 10[\s\S]*POLYNET_CODEX_WORKER_ACTIVE_RUN_WINDOW_MS = 20 \* 60 \* 1000/,
  "worker limits must bound project, deployment, user, and zombie-window admission.",
);
assert.match(
  admission,
  /tryAcquirePolynetCodexWorkerLease = internalMutation[\s\S]*expireStaleLeases[\s\S]*codex_runtime_capacity_full[\s\S]*user_run_limit_reached[\s\S]*project_run_limit_reached/,
  "worker admission must expire stale leases and enforce deployment/user/project caps.",
);
assert.match(
  admission,
  /releasePolynetCodexWorkerLease = internalMutation[\s\S]*status: "released"[\s\S]*releaseReason: args\.reason/,
  "worker admission must release capacity leases when a run finishes.",
);

assert.match(
  runToken,
  /PolynetCodexWorkerRunTokenAudience = "ingest" \| "terminal" \| "tool"[\s\S]*mintPolynetCodexWorkerRunTokenSet[\s\S]*verifyPolynetCodexWorkerRunToken[\s\S]*normalizedPayload\.aud !== params\.expectedAudience/,
  "run tokens must be short-lived and audience-bound for ingest, terminal, and tool callbacks.",
);
assert.match(
  ingest,
  /verifyPolynetCodexWorkerRunToken\(\{[\s\S]*expectedAudience: "ingest"[\s\S]*getRuntimeRunByOwnerRunIdInternal[\s\S]*workspace_preview_ready[\s\S]*releasePolynetCodexWorkerLease/,
  "ingest endpoint must verify run tokens, bind to the canonical run row, track preview ports, and release capacity.",
);
assert.match(
  terminal,
  /verifyPolynetCodexWorkerRunToken\(\{[\s\S]*expectedAudience: "terminal"[\s\S]*codex_worker_run_not_active[\s\S]*normalizeWorkspaceTerminalStartArgs[\s\S]*resolveWorkspaceTerminalPreview/,
  "terminal endpoint must verify terminal-scoped tokens, reject inactive runs, start terminals, and resolve previews.",
);
assert.match(
  tool,
  /verifyPolynetCodexWorkerRunToken\(\{[\s\S]*expectedAudience: "tool"[\s\S]*computer_open_url[\s\S]*computer_screenshot[\s\S]*executeRetrievalHarnessTool/,
  "tool endpoint must verify tool-scoped tokens and bridge computer plus PolyNet platform tools.",
);
assert.match(
  tool,
  /readRunCommunityAuthority[\s\S]*snapshotCommunityId[\s\S]*runCommunityId[\s\S]*canManageResources/,
  "tool endpoint must enforce community authority from the canonical run snapshot.",
);
assert.match(
  tool,
  /community_moderator_authority_required[\s\S]*community_member_authority_required/,
  "tool endpoint must expose explicit community authority failure codes.",
);
assert.match(
  tool,
  /function runAuthorityAllowsRequiredLane[\s\S]*requiredLane === "builder"[\s\S]*authority\?\.canManageResources === true/,
  "tool endpoint must define builder-gated community resource-lane authority.",
);
assert.match(
  tool,
  /readRunCommunityResourceLane\(runRow\)[\s\S]*runAuthorityAllowsRequiredLane\([\s\S]*surfaceEntry\.requiredCommunityResourceLane/,
  "tool endpoint must enforce community resource-lane authority for builder tools.",
);
assert.match(
  tool,
  /community_builder_authority_required[\s\S]*community_member_authority_required/,
  "tool endpoint must expose explicit community resource-lane failure codes.",
);

assert.match(
  server,
  /const WORKER_WORKSPACE_HOST_ID = "daytona" as const/,
  "worker service must be Daytona-native.",
);
assert.match(
  server,
  /POLYNET_CODEX_WORKSPACE_HOST must be daytona/,
  "worker startup must fail closed if configured as a non-Daytona workspace host.",
);
assert.match(
  server,
  /class PolynetCodexWorkerRuntime[\s\S]*private client: CodexAppServerClient \| null[\s\S]*activeTurn/,
  "worker runtime must own the Codex app-server client and active-turn state.",
);
assert.match(
  server,
  /function buildComputerOpenUrlDynamicToolSpec\(\)[\s\S]*name: CODEX_COMPUTER_OPEN_URL_TOOL_NAME/,
  "worker must define the Daytona computer open-url dynamic tool adapter.",
);
assert.match(
  server,
  /function buildComputerScreenshotDynamicToolSpec\(\)[\s\S]*name: CODEX_COMPUTER_SCREENSHOT_TOOL_NAME/,
  "worker must define the Daytona computer screenshot dynamic tool adapter.",
);
assert.match(
  server,
  /function buildCodexDynamicTools\(activeTurn: ActiveTurn\)[\s\S]*dynamicTools\.push\(buildWorkspaceServeDynamicToolSpec\(\)\)[\s\S]*buildComputerOpenUrlDynamicToolSpec\(\)[\s\S]*buildComputerScreenshotDynamicToolSpec\(\)[\s\S]*namespace: "polynet"/,
  "worker must build one dynamic tool surface for runtime adapters and polynet.* tools.",
);
assert.match(
  server,
  /receipt: \{[\s\S]*runtime_adapter_tool_names: runtimeAdapterToolNames[\s\S]*polynet_platform_tool_names: polynetPlatformToolNames[\s\S]*forbidden_tool_names_present: forbiddenToolNamesPresent/,
  "worker must build one receipt-producing dynamic tool surface for runtime adapters and polynet.* tools.",
);
assert.match(
  server,
  /handleWorkspaceServeCall[\s\S]*startDaytonaLocalServer[\s\S]*workspace_preview_ready[\s\S]*preview_url: served\.previewUrl/,
  "workspace_serve must start the Daytona-local server and emit preview evidence.",
);
assert.match(
  server,
  /handleComputerScreenshotCall[\s\S]*tool_name: "computer_screenshot"[\s\S]*run_token: bridge\.runToken/,
  "computer screenshot adapter calls must bridge through the run-scoped runtime tool token.",
);
assert.match(
  server,
  /handleComputerOpenUrlCall[\s\S]*tool_name: "computer_open_url"[\s\S]*run_token: bridge\.runToken/,
  "computer open-url adapter calls must bridge through the run-scoped runtime tool token.",
);
assert.match(
  server,
  /handlePlatformToolCall[\s\S]*activeTurn\.platformToolBridge[\s\S]*run_token: bridge\.runToken[\s\S]*context: bridge\.context[\s\S]*tool_name: toolName/,
  "polynet.* dynamic tools must bridge through the run-scoped platform tool token.",
);
assert.match(
  server,
  /createPolynetCodexWorkerServer\(runtime: PolynetCodexWorkerRuntime\)[\s\S]*\/v1\/codex\/turn\/steer[\s\S]*\/v1\/codex\/turn\/cancel[\s\S]*\/v1\/workspace\/probe[\s\S]*\/v1\/codex\/probe[\s\S]*\/v1\/codex\/turn/,
  "worker server must expose turn, steer, cancel, and workspace probe endpoints.",
);
assert.match(
  server,
  /"Retry-After": "1"[\s\S]*code: "worker_busy"/,
  "worker must fail concurrent turns with explicit worker_busy and Retry-After.",
);

assert.match(
  appServerClient,
  /spawn\(codexBin, \["app-server", "--listen", "stdio:\/\/"\]/,
  "worker must use Codex's app-server stdio transport internally, not the deleted temporary worker adapter.",
);
assert.match(
  appServerClient,
  /if \(method && "id" in message\)[\s\S]*await this\.options\.onServerRequest\(message\)[\s\S]*this\.respondError/,
  "Codex app-server client must surface dynamic tool requests to the worker.",
);
assert.match(
  daytonaConfig,
  /PolyNet attaches the app to the user's preview panel[\s\S]*Never print raw provider preview URLs/,
  "Codex developer instructions must keep preview UX in PolyNet and avoid raw provider URLs.",
);
assert.match(
  daytonaConfig,
  /Use Codex's native file editing, patching, and shell capabilities/,
  "Codex developer instructions must preserve native workspace access.",
);
assert.match(
  daytonaConfig,
  /workspace_serve[\s\S]*preview panel[\s\S]*computer_open_url[\s\S]*computer_screenshot/,
  "Codex developer instructions must distinguish preview runtime adapters from native workspace access.",
);
assert.match(
  daytonaLocalWorkspace,
  /export function getDaytonaWorkspaceRoot\(\)/,
  "worker must provide a Daytona-local workspace root helper.",
);
assert.match(
  daytonaLocalWorkspace,
  /export function getDaytonaPreviewUrlPattern\(\)/,
  "worker must provide a Daytona-local preview URL helper.",
);
assert.match(
  daytonaLocalWorkspace,
  /export async function startDaytonaLocalServer/,
  "worker must provide a Daytona-local preview server helper.",
);
assert.match(
  daytonaLocalWorkspace,
  /export async function destroyDaytonaLocalWorkspaceBestEffort/,
  "worker must provide a Daytona-local cleanup helper.",
);
assert.match(
  workerToolSpecs,
  /name: "workspace_serve"[\s\S]*WORKSPACE_PREVIEW_PORT_MIN[\s\S]*WORKSPACE_PREVIEW_PORT_MAX/,
  "workspace_serve dynamic tool spec must use the canonical preview port range.",
);
assert.match(
  workerText,
  /export function safeResourceName/,
  "worker text helpers must sanitize resource names.",
);
assert.match(
  workerText,
  /export function neutralizeWorkspaceText[\s\S]*replace\([^)]*blaxel\|daytona/,
  "worker text helpers must neutralize provider text before surfacing it.",
);
assert.match(
  workerText,
  /export function previewText/,
  "worker text helpers must bound preview text before surfacing it.",
);
assert.match(
  runner,
  /POLYNET_CODEX_WORKSPACE_HOST="\$\{POLYNET_CODEX_WORKSPACE_HOST:-daytona\}"[\s\S]*renderDaytonaCodexCliConfigToml[\s\S]*exec node[\s\S]*services\/polynet-codex-worker\/src\/server\.ts/,
  "local worker runner must render Daytona Codex config and start the canonical worker service.",
);

console.log("polynet_codex_worker_harness_contract_proof: ok");
