import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

const packageJson = read("package.json");
const schema = read("convex/schema.ts");
const targets = read("convex/daytonaCodexRuntimeTargets.ts");
const actions = read("convex/daytonaCodexRuntimeTargetActions.ts");
const policy = read("shared/daytonaCodexRuntimePolicy.ts");
const previewPort = read("shared/workspacePreviewPort.ts");
const threads = read("convex/threads.ts");

assert.match(
  packageJson,
  /"@daytona\/sdk": "\^0\.189\.0"/,
  "Daytona substrate must declare the official Daytona SDK dependency.",
);

assert.match(
  schema,
  /agentLifecycleActivations: defineTable/,
  "Mainline lifecycle activation table must be preserved during Daytona substrate port.",
);
assert.match(
  schema,
  /threads: defineTable\([\s\S]*runtimeEngine: v\.optional\(v\.union\(v\.literal\("polynet"\), v\.literal\("codex"\)\)\)/,
  "Mainline thread runtimeEngine field must be preserved.",
);
assert.match(
  schema,
  /runtimeRuns: defineTable\([\s\S]*runtimeEngine: v\.optional\(v\.union\(v\.literal\("polynet"\), v\.literal\("codex"\)\)\)/,
  "Mainline runtimeRuns runtimeEngine field must be preserved.",
);
assert.match(
  schema,
  /daytonaCodexRuntimeTargets: defineTable\(\{[\s\S]*provider: v\.literal\("daytona"\)[\s\S]*workerState: v\.union\([\s\S]*v\.literal\("creating"\)[\s\S]*v\.literal\("ready"\)[\s\S]*v\.literal\("released"\)[\s\S]*lifecycleMode[\s\S]*providerEphemeral[\s\S]*providerTeardownState[\s\S]*workspaceRetentionState[\s\S]*activePreviewPorts[\s\S]*previewLeaseState[\s\S]*cleanupDecision/,
  "Schema must persist Daytona target worker lifecycle, provider lifecycle, retention, preview, and cleanup state.",
);
assert.match(
  schema,
  /\.index\("by_owner_runId", \["ownerId", "runId"\]\)[\s\S]*\.index\("by_owner_threadId", \["ownerId", "threadId"\]\)[\s\S]*\.index\("by_workspaceRetentionState_expiresAt"[\s\S]*\.index\("by_previewLeaseState_expiresAt"/,
  "Daytona target table must support run lookup, thread reuse, retention sweeps, and preview lease sweeps.",
);

assert.match(
  policy,
  /workspaceAccess: \{[\s\S]*mode: "native_codex"[\s\S]*duplicateShellTool: false[\s\S]*serveTool: CODEX_WORKSPACE_SERVE_TOOL_NAME/,
  "Daytona policy must make Codex native workspace access canonical and avoid duplicate shell tools.",
);
assert.match(
  policy,
  /approvalPolicy: "never"[\s\S]*projectDocMaxBytes: 0[\s\S]*webSearch: "live"/,
  "Daytona policy must encode the native Codex runtime defaults.",
);
assert.match(
  policy,
  /providerEphemeralByLifecycle: \{[\s\S]*thread_ephemeral: false[\s\S]*per_turn_ephemeral: true/,
  "Daytona policy must distinguish thread reuse from per-turn ephemeral provider lifecycle.",
);
assert.match(
  policy,
  /renderDaytonaCodexCliConfigToml[\s\S]*approval_policy[\s\S]*sandbox_mode[\s\S]*project_doc_max_bytes/,
  "Daytona policy must render the native Codex CLI config from canonical policy values.",
);

assert.match(
  previewPort,
  /WORKSPACE_PREVIEW_PORT_MIN = 3000[\s\S]*WORKSPACE_PREVIEW_PORT_MAX = 9999[\s\S]*normalizeWorkspacePreviewPort/,
  "Workspace preview ports must use the narrow canonical preview port range.",
);

assert.match(
  targets,
  /claimDaytonaCodexRuntimeTargetInternal = internalMutation[\s\S]*lifecycleMode: v\.union\([\s\S]*prepared_staging_reuse[\s\S]*thread_ephemeral[\s\S]*per_turn_ephemeral[\s\S]*providerEphemeral: v\.boolean\(\)[\s\S]*provider: "daytona"[\s\S]*workerState: "creating"/,
  "Target state must atomically claim Daytona targets with lifecycle and provider persistence state.",
);
assert.match(
  targets,
  /getActiveDaytonaCodexRuntimeSubstrateForThreadInternal = internalQuery[\s\S]*previewLeaseActive[\s\S]*workerState[\s\S]*ready/,
  "Target state must expose active Daytona substrate lookup for thread/project runtime reuse.",
);
assert.match(
  targets,
  /releaseDaytonaCodexRuntimeTargetInternal = internalMutation[\s\S]*existingPreviewPorts[\s\S]*incomingPreviewPorts[\s\S]*previewLeaseState: activePreviewPorts\.length > 0 \? "active" : "none"/,
  "Target release must preserve active preview leases rather than blindly deleting the sandbox.",
);
assert.match(
  targets,
  /listExpiredDaytonaCodexRuntimeTargetsInternal = internalQuery[\s\S]*workspaceRetentionState[\s\S]*previewLeaseState/,
  "Target state must support cleanup sweepers for retention and preview leases.",
);

assert.match(
  actions,
  /^"use node";[\s\S]*await import\("@daytona\/sdk"\)/,
  "Provider actions must run in Convex Node and load the official Daytona SDK.",
);
assert.match(
  actions,
  /DAYTONA_RUNTIME_POLICY[\s\S]*defaultDaytonaProviderEphemeralForLifecycleMode/,
  "Provider actions must derive lifecycle and resource policy from the canonical Daytona policy.",
);
assert.match(
  actions,
  /function sanitizeDaytonaRuntimeError\(value: unknown\): string[\s\S]*redacted-secret[\s\S]*redacted-token[\s\S]*redacted-daytona-preview-url/,
  "Provider actions must sanitize secrets, tokens, and signed Daytona preview URLs.",
);
assert.match(
  actions,
  /daytona_direct_snapshot_required[\s\S]*daytona_snapshot_runtime_incomplete:package_json_missing[\s\S]*daytona_snapshot_runtime_incomplete:codex_cli_missing/,
  "Provider actions must fail closed instead of provisioning incomplete Codex runtime snapshots.",
);
assert.match(
  actions,
  /ensureDaytonaCodexRuntimeTargetInternal = internalAction[\s\S]*claimDaytonaCodexRuntimeTargetInternal[\s\S]*markDaytonaCodexRuntimeTargetReadyInternal/,
  "Provider actions must bridge target claim to real Daytona sandbox readiness.",
);

assert.match(
  threads,
  /import \{ normalizeWorkspacePreviewPort \} from "\.\.\/shared\/workspacePreviewPort";/,
  "Threads backend must use the canonical preview-port policy.",
);
assert.match(
  threads,
  /getDaytonaWorkspacePreviewReadyEventInternal = internalQuery[\s\S]*workspace_preview_ready[\s\S]*provider[\s\S]*daytona[\s\S]*normalizeWorkspacePreviewPort\(payload\.port\)/,
  "Threads backend must expose Daytona preview evidence lookup for provider preview authorization.",
);
assert.match(
  threads,
  /appendCloudRuntimeRunEventInternal = internalMutation[\s\S]*runtimeRunEvents[\s\S]*runtimeHarnessTelemetrySummary/,
  "Threads backend must expose an internal runtime-event append path for provider actions.",
);

console.log("daytona_runtime_substrate_contract_proof: ok");
