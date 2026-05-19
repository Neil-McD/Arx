import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();

async function readRepoFile(relativePath: string): Promise<string> {
  return await readFile(path.join(rootDir, relativePath), "utf8");
}

function sliceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `expected source to include ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `expected source to include ${endNeedle}`);
  return source.slice(start, end);
}

async function main() {
  const sharedCredits = await readRepoFile("shared/workspaceCredits.ts");
  const schema = await readRepoFile("convex/schema.ts");
  const workspaceTerminals = await readRepoFile("convex/workspaceTerminals.ts");
  const runtimeExecutionSession = await readRepoFile("convex/runtimeExecutionSession.ts");
  const daytonaWorkspaceSession = await readRepoFile("convex/daytonaWorkspaceSession.ts");
  const daytonaSandboxClient = await readRepoFile("convex/daytonaSandboxClient.ts");
  const backgroundService = await readRepoFile("convex/workspaceTerminalBackgroundService.ts");
  const lifecycle = await readRepoFile("convex/daytonaWorkspaceLifecycle.ts");
  const threads = await readRepoFile("convex/threads.ts");
  const crons = await readRepoFile("convex/crons.ts");
  const codexProbeScript = await readRepoFile("shared/codexHarnessProbeScript.ts");
  const stagingEvidence = await readRepoFile("scripts/staging_codex_thread_binding_evidence.ts");

  assert.match(
    sharedCredits,
    /DAYTONA_WORKSPACE_IDLE_STOP_SECONDS\s*=\s*10\s*\*\s*60/,
    "Daytona workspace idle stop should default to 10 minutes",
  );
  assert.match(
    sharedCredits,
    /DAYTONA_WORKSPACE_SESSION_MAX_SECONDS\s*=\s*30\s*\*\s*60/,
    "Daytona workspace sessions should have a 30-minute hard budget cap",
  );
  assert.match(
    sharedCredits,
    /DAYTONA_WORKSPACE_SESSION_IDLE_AUTOSTOP_MINUTES\s*=\s*15/,
    "Daytona provider auto-stop should remain enabled as a provider backstop",
  );
  assert.match(
    schema,
    /providerSandboxLastActivityAt:\s*v\.optional\(v\.number\(\)\)[\s\S]*providerSandboxIdleExpiresAt:\s*v\.optional\(v\.number\(\)\)[\s\S]*providerSandboxStopLeaseExpiresAt:\s*v\.optional\(v\.number\(\)\)/,
    "cloud projects should persist sandbox activity, idle-expiry, and stop-lease timestamps",
  );
  assert.match(
    schema,
    /\.index\("by_providerSandboxState_idleExpiresAt",\s*\[[\s\S]*"providerSandboxState"[\s\S]*"providerSandboxIdleExpiresAt"[\s\S]*\]\)/,
    "idle workspace sandbox reconciliation should have an indexed project scan",
  );
  assert.match(
    schema,
    /\.index\("by_workspaceSessionState_providerSandboxId",\s*\[[\s\S]*"workspaceSessionState"[\s\S]*"workspaceProviderSandboxId"[\s\S]*\]\)/,
    "idle cleanup should be able to detect active runtime runs by sandbox id",
  );
  assert.match(
    schema,
    /\.index\("by_workspaceSessionState_providerSandboxId_status",\s*\[[\s\S]*"workspaceSessionState"[\s\S]*"workspaceProviderSandboxId"[\s\S]*"status"[\s\S]*\]\)/,
    "idle cleanup should directly query running runtime runs on the same sandbox",
  );

  const setProjectBackgroundSandboxBlock = sliceBetween(
    workspaceTerminals,
    "export const setProjectBackgroundSandboxInternal",
    "export const touchProjectBackgroundSandboxActivityInternal",
  );
  assert.match(
    workspaceTerminals,
    /DAYTONA_WORKSPACE_IDLE_STOP_SECONDS[\s\S]*DAYTONA_WORKSPACE_IDLE_STOP_MS/,
    "workspace terminal lifecycle should derive idle expiry from the shared 10-minute policy",
  );
  assert.match(
    setProjectBackgroundSandboxBlock,
    /providerSandboxLastActivityAt[\s\S]*providerSandboxIdleExpiresAt[\s\S]*buildProjectSandboxIdleExpiresAt\(lastActivityAt\)/,
    "registering/reusing a project sandbox should refresh the PolyNet-owned idle lease",
  );
  assert.match(
    workspaceTerminals,
    /export const touchProjectBackgroundSandboxActivityInternal[\s\S]*isActiveStopLease\(project,\s*nowMs\)[\s\S]*return null[\s\S]*providerSandboxLastActivityAt:\s*nowMs[\s\S]*providerSandboxIdleExpiresAt:\s*buildProjectSandboxIdleExpiresAt\(nowMs\)/,
    "runtime and terminal activity should touch the idle lease but not revive an active stopping sandbox",
  );
  assert.match(
    workspaceTerminals,
    /export const listIdleProjectBackgroundSandboxesInternal[\s\S]*gt\("providerSandboxIdleExpiresAt",\s*0\)[\s\S]*lte\("providerSandboxIdleExpiresAt",\s*args\.nowMs\)[\s\S]*const derivedIdleExpiresAt = readProjectSandboxIdleExpiresAt\(row\)[\s\S]*derivedIdleExpiresAt > 0[\s\S]*derivedIdleExpiresAt <= args\.nowMs[\s\S]*q\.eq\("providerSandboxState",\s*"error"\)[\s\S]*idleExpiresAt > 0 && idleExpiresAt <= args\.nowMs/,
    "idle reconciliation should query only explicit positive expiries, safely derive pre-lease expiries, and retry failed cleanup rows",
  );
  assert.match(
    workspaceTerminals,
    /export const acquireProjectBackgroundSandboxStopLeaseInternal[\s\S]*state !== "started" && state !== "stopping" && state !== "error"[\s\S]*activeTerminalRows[\s\S]*isTerminalActiveStatus\(row\.status\)[\s\S]*activeRuntimeRows[\s\S]*by_workspaceSessionState_providerSandboxId_status[\s\S]*eq\("status",\s*"running"\)[\s\S]*activeRuntimeRows\.length > 0[\s\S]*providerSandboxState:\s*"stopping"[\s\S]*providerSandboxStopLeaseExpiresAt:\s*leaseExpiresAt/,
    "idle reconciliation should atomically acquire a stop lease after checking active terminals and Codex runtime runs, including cleanup retries from error state",
  );
  assert.match(
    workspaceTerminals,
    /clearProjectBackgroundSandboxInternal[\s\S]*providerSandboxLastActivityAt:\s*undefined[\s\S]*providerSandboxIdleExpiresAt:\s*undefined[\s\S]*providerSandboxStopLeaseExpiresAt:\s*undefined/,
    "clearing a project sandbox should clear idle lease and stop lease fields",
  );

  assert.match(
    runtimeExecutionSession,
    /touchProjectBackgroundSandboxActivityInternal[\s\S]*refreshDaytonaSandboxActivity[\s\S]*setInterval[\s\S]*touchWorkspaceActivity\(activeSession\)/,
    "active runtime sessions should keep both the PolyNet idle lease and Daytona provider activity fresh while Codex works",
  );
  assert.match(
    daytonaSandboxClient,
    /export async function refreshDaytonaSandboxActivity[\s\S]*\/sandbox\/\$\{encodeURIComponent\(params\.sandboxId\)\}\/last-activity[\s\S]*method:\s*"POST"/,
    "Daytona activity refresh should call the provider last-activity endpoint",
  );
  assert.match(
    lifecycle,
    /reconcileIdleProjectSandboxesInternal[\s\S]*listIdleProjectBackgroundSandboxesInternal[\s\S]*acquireProjectBackgroundSandboxStopLeaseInternal[\s\S]*stopLease\?\.acquired !== true[\s\S]*active_runtime_run[\s\S]*releaseProjectBackgroundSandboxIfIdle/,
    "idle lifecycle reconciliation should acquire an authoritative stop lease before provider cleanup/accounting",
  );
  assert.match(
    threads,
    /hasActiveWorkspaceRuntimeRunForSandboxInternal[\s\S]*by_workspaceSessionState_providerSandboxId_status[\s\S]*eq\("status",\s*"running"\)[\s\S]*take\(1\)/,
    "active runtime-run detection should directly query running workspace sessions on the same sandbox",
  );
  assert.match(
    crons,
    /reconcile idle daytona workspace sandboxes[\s\S]*\{\s*minutes:\s*2\s*\}[\s\S]*reconcileIdleProjectSandboxesInternal/,
    "idle lifecycle reconciler should run frequently enough to control cost",
  );

  for (const [label, source] of [
    ["run workspace sessions", daytonaWorkspaceSession],
    ["project background sandboxes", backgroundService],
  ] as const) {
    assert.match(
      source,
      /autoStopInterval:\s*DAYTONA_WORKSPACE_SESSION_IDLE_AUTOSTOP_MINUTES/,
      `${label} should keep Daytona provider auto-stop enabled as a backstop`,
    );
  }
  assert.match(
    backgroundService,
    /providerSandboxState:\s*"error"[\s\S]*touchActivity:\s*false/,
    "failed provider cleanup should not extend the user-visible idle lease",
  );
  assert.match(
    backgroundService,
    /releaseProjectBackgroundSandboxIfIdle[\s\S]*hasActiveWorkspaceRuntimeRunForSandboxInternal[\s\S]*activeRuntimeRun\?\.hasActive === true[\s\S]*return/,
    "shared background sandbox release should skip provider teardown while a Codex runtime run is active",
  );
  assert.match(
    backgroundService,
    /BACKGROUND_SANDBOX_STOPPING_CODE = "background_sandbox_stopping"[\s\S]*isBackgroundSandboxStopping[\s\S]*providerSandboxStopLeaseExpiresAt[\s\S]*resolveProjectBackgroundSandboxIfReady[\s\S]*backgroundSandboxStoppingResult\(project\)[\s\S]*resolveTerminalSandboxContext[\s\S]*backgroundSandboxStoppingResult\(project\)/,
    "background sandbox resolvers should reject adoption while a stop lease is active",
  );
  assert.match(
    daytonaSandboxClient,
    /function isDaytonaDestroyedState[\s\S]*state === "destroyed" \|\| state === "destroying"/,
    "Daytona lifecycle client should recognize destroyed/destroying as provider deletion states",
  );
  assert.match(
    daytonaSandboxClient,
    /waitForDaytonaSandboxStopped[\s\S]*isDaytonaStoppedState\(lookup\.payload\.state\)[\s\S]*isDaytonaDestroyedState\(lookup\.payload\.state\)[\s\S]*sandbox:\s*null/,
    "waiting for Daytona stop should treat auto-delete destroyed states as successful teardown",
  );
  assert.match(
    daytonaSandboxClient,
    /deleteDaytonaSandbox[\s\S]*const idempotentStatus[\s\S]*res\.status === 404 \|\| res\.status === 409 \|\| res\.status === 410[\s\S]*messageText\.includes\("destroying"\)[\s\S]*return \{ ok: true \}/,
    "Daytona delete should be idempotent only for expected not-found/destroying client states",
  );

  assert.match(
    codexProbeScript,
    /const threadApprovalPolicy = primaryTurnRequested \? "never" : "on-request"/,
    "primary Codex workspace turns should run without approval prompts",
  );
  assert.match(
    codexProbeScript,
    /primaryTurnRequested[\s\S]*type:\s*"workspaceWrite"[\s\S]*writableRoots:\s*\[process\.cwd\(\)\][\s\S]*networkAccess:\s*false[\s\S]*excludeTmpdirEnvVar:\s*true[\s\S]*excludeSlashTmp:\s*true/,
    "primary Codex workspace turns should stay workspace-bounded with network and temp access disabled",
  );
  assert.match(
    stagingEvidence,
    /sandboxPolicyType === "workspaceWrite"[\s\S]*sandboxPolicyNetworkAccess === false[\s\S]*sandboxPolicyWritableRootCount === 1[\s\S]*sandboxPolicyExcludeTmpdirEnvVar === true[\s\S]*sandboxPolicyExcludeSlashTmp === true/,
    "staging thread-binding evidence should assert the Codex workspace sandbox policy",
  );

  console.log("daytona_workspace_lifecycle_proof: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
