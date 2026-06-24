import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

function assertContains(haystack: string, needle: string, label: string): void {
  assert.ok(haystack.includes(needle), `expected ${label}`);
}

function assertNotContains(haystack: string, needle: string, label: string): void {
  assert.ok(!haystack.includes(needle), `did not expect ${label}`);
}

function assertOrdered(
  haystack: string,
  first: string,
  second: string,
  label: string,
): void {
  const firstIndex = haystack.indexOf(first);
  const secondIndex = haystack.indexOf(second);
  assert.notEqual(firstIndex, -1, `expected ${label} first marker`);
  assert.notEqual(secondIndex, -1, `expected ${label} second marker`);
  assert.ok(firstIndex < secondIndex, `expected ${label}`);
}

function sliceBetween(haystack: string, start: string, end: string): string {
  const startIndex = haystack.indexOf(start);
  assert.notEqual(startIndex, -1, `expected start marker: ${start}`);
  const endIndex = haystack.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `expected end marker: ${end}`);
  return haystack.slice(startIndex, endIndex);
}

const packageJson = read("package.json");
const handler = read("convex/runtimeTurnHandlers.ts");
const targets = read("convex/daytonaCodexRuntimeTargets.ts");
const actions = read("convex/daytonaCodexRuntimeTargetActions.ts");
const crons = read("convex/crons.ts");
const worker = read("services/polynet-codex-worker/src/server.ts");
const workerTool = read("convex/polynetCodexWorkerTool.ts");
const config = read("services/polynet-codex-worker/src/daytonaCodexConfig.ts");

const teardownAction = sliceBetween(
  actions,
  "export const teardownDaytonaCodexRuntimeTargetInternal = internalAction({",
  "async function appendTeardownRuntimeEventBestEffort",
);
const previewResolver = sliceBetween(
  actions,
  "export const resolveDaytonaCodexRuntimePreviewInternal = internalAction({",
  "export const teardownDaytonaCodexRuntimeTargetInternal = internalAction({",
);
const previewStop = sliceBetween(
  actions,
  "export const stopDaytonaAppPreviewInternal = internalAction({",
  "export const captureDaytonaComputerUseScreenshotInternal = internalAction({",
);
const expiredSweep = sliceBetween(
  actions,
  "export const sweepExpiredDaytonaCodexRuntimeTargetsInternal = internalAction({",
  "export const stopDaytonaAppPreviewInternal = internalAction({",
);

assertContains(
  packageJson,
  '"check:daytona-preview-computer-lifecycle-contract-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts/daytona_preview_computer_lifecycle_contract_proof.ts"',
  "package script for Daytona preview/computer lifecycle proof",
);

assertContains(
  worker,
  'this.emitRuntimeEvent("workspace_preview_ready"',
  "worker emits workspace_preview_ready when workspace_serve succeeds",
);
assertContains(
  worker,
  "preview_url_hint: served.previewUrlHint",
  "worker emits preview URL hints as runtime evidence",
);
assertContains(
  worker,
  "The app is running; PolyNet is attaching the Daytona preview panel.",
  "worker copy keeps the preview panel as canonical UX when no direct URL is available",
);
assertContains(
  config,
  "Never print raw provider preview URLs.",
  "Codex Daytona instructions prohibit printing raw provider preview URLs",
);
assertContains(
  config,
  "Prefer workspace_serve over a long-running shell command for preview servers.",
  "Codex Daytona instructions route preview servers through workspace_serve",
);

assertContains(
  handler,
  'workerEventType === "workspace_preview_ready"',
  "runtime handler recognizes worker preview-ready events",
);
assertContains(
  handler,
  "workerActivePreviewPorts.add(Math.floor(previewPort))",
  "runtime handler records active preview ports",
);
assertContains(
  handler,
  "activePreviewPorts: Array.from(workerActivePreviewPorts)",
  "runtime handler passes preview ports into target release",
);
assertOrdered(
  handler,
  'workerEventType === "workspace_preview_ready"',
  "releaseDaytonaCodexRuntimeTargetInternal",
  "runtime must observe preview-ready events before releasing the target",
);

assertContains(
  targets,
  "existingPreviewPorts",
  "release mutation preserves existing preview ports",
);
assertContains(
  targets,
  "incomingPreviewPorts",
  "release mutation merges incoming preview ports",
);
assertContains(
  targets,
  'previewLeaseState: activePreviewPorts.length > 0 ? "active" : "none"',
  "release mutation activates preview lease when preview ports exist",
);
assertContains(
  targets,
  "defaultPreviewLeaseExpiresAt(nowMs)",
  "release mutation applies default preview lease expiry",
);
assertContains(
  targets,
  "markDaytonaCodexRuntimeTargetPreviewLeaseExpiredInternal",
  "target state can expire preview leases",
);
assertContains(
  targets,
  'previewLeaseState: "expired"',
  "expired preview leases become explicit target state",
);
assertContains(
  targets,
  "cleanupEligibleAt: nowMs",
  "expired preview leases become cleanup eligible",
);
assertContains(
  targets,
  "markDaytonaCodexRuntimeTargetPreviewPortsStoppedInternal",
  "target state can remove stopped preview ports",
);
assertContains(
  targets,
  "remainingPreviewPorts",
  "stopping previews preserves any remaining active ports",
);

assertContains(
  teardownAction,
  "const previewLeaseActive = isActivePreviewLease(target, decisionNowMs)",
  "teardown checks preview lease activity before deleting",
);
assertContains(
  teardownAction,
  'cleanupDecision: "keep_running_active_preview"',
  "active preview lease keeps provider running",
);
assertContains(
  teardownAction,
  'state: "skipped"',
  "active preview lease records skipped teardown",
);
assertContains(
  teardownAction,
  'reason: `${args.reason}:active_preview_lease`',
  "active preview lease records explicit teardown reason",
);
assertOrdered(
  teardownAction,
  "const previewLeaseActive = isActivePreviewLease(target, decisionNowMs)",
  "await deleteDaytonaSandbox({ daytona, sandbox, timeoutSeconds })",
  "teardown must evaluate preview lease before provider delete",
);
assertContains(
  teardownAction,
  'cleanupDecision: "delete_without_active_lease"',
  "inactive preview leases allow provider delete",
);

assertContains(
  expiredSweep,
  "markDaytonaCodexRuntimeTargetPreviewLeaseExpiredInternal",
  "expired preview sweeper marks preview lease expired",
);
assertOrdered(
  expiredSweep,
  "markDaytonaCodexRuntimeTargetPreviewLeaseExpiredInternal",
  "teardownAndRecordDaytonaCodexRuntimeTargetInternal",
  "sweeper must expire preview lease before teardown",
);
assertContains(
  crons,
  "sweep expired daytona codex runtime targets",
  "Convex cron schedules Daytona runtime target sweeper",
);
assertContains(
  crons,
  "{ minutes: 5 }",
  "Daytona runtime target sweeper runs on a short bounded interval",
);
assertContains(
  crons,
  "daytonaCodexRuntimeTargetActions",
  "Daytona runtime target sweeper cron calls the Daytona action module",
);
assertContains(
  crons,
  "sweepExpiredDaytonaCodexRuntimeTargetsInternal",
  "Daytona runtime target sweeper cron calls the canonical internal action",
);
assertContains(
  crons,
  "limit: 20",
  "Daytona runtime target sweeper cron is bounded",
);
assertOrdered(
  crons,
  "finalize expired blaxel project workspace leases",
  "sweep expired daytona codex runtime targets",
  "Daytona cleanup should not disturb existing Blaxel project lease finalization order",
);
assertOrdered(
  crons,
  "sweep expired daytona codex runtime targets",
  "reconcile expired credit reservations",
  "Daytona target cleanup should run before generic expired credit reservation cleanup",
);

assertContains(
  previewStop,
  "markDaytonaCodexRuntimeTargetPreviewPortsStoppedInternal",
  "preview stop removes stopped ports from target state",
);
assertOrdered(
  previewStop,
  "markDaytonaCodexRuntimeTargetPreviewPortsStoppedInternal",
  "teardownAndRecordDaytonaCodexRuntimeTargetInternal",
  "preview stop updates ports before teardown reevaluates lifecycle",
);

assertContains(
  previewResolver,
  "previewLeaseActive",
  "preview resolver checks active preview lease",
);
assertContains(
  previewResolver,
  "activePreviewPorts.includes(port)",
  "preview resolver authorizes only active preview ports",
);
assertContains(
  previewResolver,
  "mintPreviewProxySessionToken",
  "preview resolver mints PolyNet preview proxy token",
);
assertContains(
  previewResolver,
  'preview_transport: "polynet_preview_gateway"',
  "preview resolver exposes PolyNet preview gateway transport",
);
assertContains(
  previewResolver,
  "preview_proxy_token: minted.token",
  "preview resolver returns proxy token instead of raw Daytona URL",
);
assertNotContains(
  previewResolver,
  "preview_url:",
  "preview resolver should not return raw provider preview URL",
);

assertContains(
  actions,
  "function normalizeComputerOpenUrl",
  "computer open URL has a central normalizer",
);
assertContains(
  actions,
  "computer_open_url_credentials_not_allowed",
  "computer open URL rejects embedded credentials",
);
assertContains(
  actions,
  "computer_open_url_external_not_allowed",
  "computer open URL rejects external URLs unless explicitly enabled",
);
assertContains(
  actions,
  "Only localhost workspace preview URLs are enabled for Daytona computer inspection.",
  "computer open URL defaults to localhost preview inspection",
);
assertContains(
  actions,
  "openDaytonaComputerUseUrlInternal",
  "provider action exposes computer open URL",
);
assertContains(
  actions,
  "captureDaytonaComputerUseScreenshotInternal",
  "provider action exposes computer screenshot",
);

assertContains(
  workerTool,
  'expectedAudience: "tool"',
  "worker tool endpoint requires tool-scoped run token",
);
assertContains(
  workerTool,
  "getRuntimeRunByOwnerRunIdInternal",
  "worker tool endpoint revalidates live run authority",
);
assertContains(
  workerTool,
  'String(runRow.engineId ?? "") !== POLYNET_CODEX_WORKER_ENGINE_ID',
  "worker tool endpoint is bound to Codex worker runs",
);
assertContains(
  workerTool,
  'runStatus !== "running"',
  "worker tool endpoint only executes for active runs",
);
assertContains(
  workerTool,
  'requestedToolName === "computer_open_url"',
  "worker tool endpoint routes computer open URL",
);
assertContains(
  workerTool,
  'requestedToolName === "computer_screenshot"',
  "worker tool endpoint routes computer screenshot",
);
assertContains(
  workerTool,
  "openDaytonaComputerUseUrlInternal",
  "worker tool endpoint delegates computer open URL to Daytona provider action",
);
assertContains(
  workerTool,
  "captureDaytonaComputerUseScreenshotInternal",
  "worker tool endpoint delegates screenshot to Daytona provider action",
);

console.log("daytona_preview_computer_lifecycle_contract_proof: ok");
