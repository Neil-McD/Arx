import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

function readText(filePath: string): string {
  return readFileSync(path.join(rootDir, filePath), "utf8");
}

function main() {
  const schema = readText("convex/schema.ts");
  const bindings = readText("convex/codexHarnessThreadBindings.ts");
  const bridge = readText("convex/codexHarnessBridge.ts");
	  const probeScript = readText("shared/codexHarnessProbeScript.ts");
	  const stagingMaintenance = readText("convex/stagingMaintenance.ts");
		  const stagingMaintenanceCli = readText("scripts/staging_maintenance_cli.ts");
		  const stagingThreadBindingEvidence = readText("scripts/staging_codex_thread_binding_evidence.ts");
		  const stagingWorkspaceHandoffCanary = readText("scripts/staging_codex_workspace_handoff_canary.ts");
		  const packageJson = readText("package.json");

  assert.match(
    schema,
    /codexHarnessThreadBindings: defineTable/,
    "Codex thread bindings should have a first-party persistence table",
  );
  assert.match(
    schema,
    /codexHarnessThreadBindingLocks: defineTable/,
    "Codex thread bindings should have a first-party per-binding lock table",
  );
  assert.match(
    schema,
    /codexMcpProjectionFingerprint: v\.string\(\)/,
    "Codex thread bindings should persist the MCP projection fingerprint",
  );
  assert.match(
    schema,
    /codexDynamicToolSurfaceFingerprint: v\.optional\(v\.string\(\)\)/,
    "Codex thread bindings should persist the full dynamic tool surface fingerprint when available",
  );
  assert.match(
    schema,
    /\.index\("by_bindingKey", \["bindingKey"\]\)/,
    "Codex thread bindings should be keyed by a stable binding key",
  );

  assert.match(
    bindings,
    /resolveCodexHarnessThreadBindingForTurnInternal/,
    "harness should resolve create/resume/rotate before each Codex turn",
  );
  assert.match(
    bindings,
    /projection_fingerprint_match/,
    "matching projection fingerprints should resume the existing Codex thread",
  );
  assert.match(
    bindings,
    /projection_fingerprint_changed/,
    "changed projection fingerprints should rotate the Codex thread",
  );
  assert.match(
    bindings,
    /dynamic_tool_surface_fingerprint_match/,
    "matching full dynamic tool surface fingerprints should resume the existing Codex thread",
  );
  assert.match(
    bindings,
    /dynamic_tool_surface_fingerprint_changed/,
    "changed full dynamic tool surface fingerprints should rotate the Codex thread",
  );
  assert.match(
    bindings,
    /upsertCodexHarnessThreadBindingAfterRunInternal/,
    "successful Codex turns should upsert the observed Codex thread binding",
  );
  assert.match(
    bindings,
    /acquireCodexHarnessThreadBindingLockInternal/,
    "Codex turns should acquire a per-binding lock before using the session archive",
  );
  assert.match(
    bindings,
    /releaseCodexHarnessThreadBindingLockInternal/,
    "Codex turns should release the per-binding lock after the run finishes",
  );
	  assert.match(
	    bindings,
	    /cleanupExpiredCodexHarnessThreadBindingLocksInternal/,
	    "expired Codex binding locks should be cleanable",
	  );
	  assert.match(
	    bindings,
	    /pickCanonicalBindingRow/,
	    "Codex thread binding resolution should choose a deterministic canonical row when duplicate rows exist",
	  );
	  assert.match(
	    bindings,
	    /rotateDuplicateBindingRows/,
	    "Codex thread binding upserts should repair duplicate binding rows instead of silently leaving ambiguity",
	  );
	  assert.match(
	    bindings,
	    /duplicateLockCount/,
	    "Codex binding locks should surface duplicate lock rows in mutation results",
	  );
  assert.match(
    stagingMaintenance,
    /runCodexHarnessLockContentionCanary/,
    "staging should expose a synthetic lock contention canary",
  );
  assert.match(
    stagingMaintenance,
    /cleanupCodexHarnessOperability/,
    "staging should expose gated Codex harness cleanup",
  );
	  assert.match(
	    stagingMaintenance,
	    /codexHarnessThreadBindingLocks/,
	    "staging operability fingerprint should count Codex binding locks",
	  );
	  assert.match(
	    stagingMaintenance,
	    /ensureStagingMountedMcpCanary/,
	    "staging should seed a canonical user harness MCP canary for Codex projection proof",
	  );
		  assert.match(
		    stagingMaintenance,
		    /runCodexMountedMcpCanaryTurn/,
		    "staging should expose a gated mounted MCP Codex canary turn",
		  );
		  assert.match(
		    stagingMaintenance,
		    /summarizeStagingRuntimeSseResponse/,
		    "staging streaming canary should parse the SSE response into safe counts",
		  );
		  assert.match(
		    stagingMaintenance,
		    /\.then\(\(\) => \{[\s\S]*close\(\);[\s\S]*\}\)/,
		    "staging SSE test response should close after async streaming handlers resolve",
		  );
		  assert.match(
		    stagingMaintenance,
		    /mcp_tool_execution_completed/,
		    "staging Codex evidence should include runtime MCP execution events",
		  );
	  assert.match(
	    stagingMaintenance,
	    /duplicateActiveKeyCount/,
	    "staging operability fingerprint should expose duplicate active binding and lock keys",
	  );
	  assert.match(
	    packageJson,
	    /check:staging-codex-harness-operability/,
	    "package scripts should include the staging Codex operability canary",
	  );
		  assert.match(
		    packageJson,
		    /check:staging-codex-mounted-mcp-canary/,
		    "package scripts should include the staging mounted MCP Codex canary",
		  );
		  assert.match(
		    packageJson,
		    /check:staging-codex-workspace-handoff-canary/,
		    "package scripts should include the staging Codex workspace handoff canary",
		  );
		  assert.match(
		    stagingWorkspaceHandoffCanary,
		    /stagingMaintenance:runCodexWorkspaceHandoffCanaryTurn/,
		    "workspace handoff canary script should call the gated staging maintenance action",
		  );
		  assert.match(
		    stagingWorkspaceHandoffCanary,
		    /codex_workspace_handoff_started[\s\S]*codex_workspace_handoff_completed/,
		    "workspace handoff canary should assert Codex handoff start and completion evidence",
		  );
		  assert.match(
		    stagingWorkspaceHandoffCanary,
		    /harness_id === "polynet_native"/,
		    "workspace handoff canary should assert PolyNet native remains the outer runtime",
		  );
  assert.match(
    stagingMaintenanceCli,
    /acquireMaintenanceSetupLock/,
    "staging maintenance scripts should serialize temporary maintenance token setup",
  );
  assert.match(
    stagingMaintenanceCli,
    /removeStaleMaintenanceSetupLock/,
    "staging maintenance scripts should recover stale local setup locks",
  );
  assert.match(
    stagingMaintenanceCli,
    /isProcessAlive/,
    "staging maintenance scripts should distinguish live lock owners from crashed processes",
  );
  assert.match(
    stagingMaintenanceCli,
    /15 \* 60 \* 1000/,
    "staging maintenance locks should have a bounded stale-lock timeout",
  );
  assert.match(
    stagingMaintenanceCli,
    /ageMs > 30_000/,
    "staging maintenance scripts should not remove newly-created empty lock files during metadata write races",
  );
  assert.match(
    stagingMaintenanceCli,
    /!raw\.trim\(\)/,
    "staging maintenance scripts should distinguish empty lock metadata races from stale locks",
  );
  assert.match(
    stagingMaintenanceCli,
    /lockId/,
    "staging maintenance lock ownership should include a per-acquisition nonce",
  );
  assert.match(
    stagingMaintenanceCli,
    /readFileSync\(lockPath, "utf8"\) === lockPayload/,
    "staging maintenance lock release should only remove the lock it owns",
  );
  assert.match(
    stagingMaintenanceCli,
    /convexEnvGet\(options, "POLYNET_STAGING_MAINTENANCE_TOKEN"\)/,
	    "staging maintenance scripts should reuse an existing maintenance token instead of overwriting it",
	  );
		  assert.match(
		    stagingThreadBindingEvidence,
		    /--require-sandbox-policy-evidence/,
		    "staging thread-binding evidence should support an explicit fresh sandbox-policy evidence assertion",
		  );
		  assert.match(
		    stagingThreadBindingEvidence,
		    /function findResumePair/,
		    "staging thread-binding evidence should pair create/resume runs by the same thread/project/projection",
		  );
		  assert.match(
		    stagingThreadBindingEvidence,
		    /buildResumePairingKey/,
		    "staging thread-binding evidence should avoid broad-window mismatches by grouping resume evidence",
		  );
		  assert.match(
		    stagingMaintenanceCli,
		    /redactSensitiveText/,
		    "staging maintenance CLI should redact maintenance tokens from JSON parse failures",
		  );
		  assert.doesNotMatch(
		    stagingMaintenanceCli,
		    /args\.join\(" "\)/,
		    "staging maintenance CLI should not dump raw command args that may include maintenance tokens",
		  );

  assert.match(
    bridge,
    /buildCodexHarnessThreadHomePath/,
    "primary harness should use a stable Codex home path for continuity",
  );
  assert.match(
    bridge,
    /POLYNET_CODEX_HOME_DIR=\$\{shellQuote\(bindingCodexHomePath\)\}/,
    "sidecar should receive the stable Codex home path",
  );
  assert.match(
    bridge,
    /POLYNET_CODEX_RESUME_THREAD_ID=\$\{shellQuote\(resumeCodexThreadId\)\}/,
    "sidecar should receive the resumable Codex thread id only when safe",
  );
  assert.match(
    bridge,
    /buildCodexHarnessDynamicToolSurfaceFingerprint/,
    "primary harness should fingerprint the complete dynamic tool surface before resolving Codex thread continuity",
  );
  assert.match(
    bridge,
    /codexDynamicToolSurfaceFingerprint:\s*codexDynamicToolSurface\.fingerprint/,
    "primary harness should resolve thread bindings using the full Codex dynamic tool surface fingerprint",
  );
  for (const eventName of [
    "codex_thread_binding_resolved",
    "codex_thread_binding_lock_acquired",
    "codex_thread_binding_lock_conflict",
    "codex_thread_binding_lock_released",
    "codex_thread_binding_created",
    "codex_thread_binding_resumed",
    "codex_thread_binding_rotated",
    "codex_thread_binding_persist_skipped",
    "codex_mcp_projection_fingerprint_changed",
  ]) {
    assert.match(
      bridge,
      new RegExp(eventName),
      `bridge should emit ${eventName}`,
    );
  }
  assert.match(
    bridge,
    /observed_codex_thread_id: observedCodexThreadId/,
    "primary harness should emit immutable per-run observed Codex thread ids",
  );
  assert.match(
    bridge,
    /codex_session_archive_strategy: "sessions_tar_v0"/,
    "primary harness should label the session archive strategy in run evidence",
  );
  assert.match(
    bridge,
    /acquireCodexHarnessThreadBindingLockInternal/,
    "primary harness should acquire the binding lock before running Codex",
  );
  assert.match(
    bridge,
    /releaseCodexHarnessThreadBindingLockBestEffort/,
    "primary harness should release the binding lock in the finalizer",
  );
		  assert.match(
		    bridge,
		    /read_only_dynamic_bridge_v0/,
		    "thread binding slice should identify read-only MCP dynamic bridge execution",
		  );
	  assert.match(
	    bridge,
	    /duplicate_binding_count/,
	    "primary harness should emit duplicate binding invariant evidence",
	  );
	  assert.match(
	    bridge,
	    /sandbox_policy_network_access/,
	    "primary harness should emit requested sandbox network policy evidence",
	  );

  assert.match(
    probeScript,
    /POLYNET_CODEX_HOME_DIR/,
    "sidecar should read and scrub POLYNET_CODEX_HOME_DIR",
  );
  assert.match(
    probeScript,
    /POLYNET_CODEX_RESUME_THREAD_ID/,
    "sidecar should read and scrub POLYNET_CODEX_RESUME_THREAD_ID",
  );
  assert.match(
    probeScript,
    /thread\/resume/,
    "sidecar should attempt Codex app-server thread/resume",
  );
  assert.match(
    probeScript,
    /threadId !== resumeThreadId/,
    "sidecar should reject thread/resume responses with a different Codex thread id",
  );
  assert.match(
    probeScript,
    /resume_failed_started/,
    "sidecar should fall back to a fresh thread if resume fails",
  );
  assert.match(
    probeScript,
    /mkdtempSync\(path\.join\(os\.tmpdir\(\), "polynet-codex-home-"\)\)/,
    "sidecar should run Codex against a sandbox-local runtime home",
  );
  assert.match(
    probeScript,
    /codex-sessions\.tar/,
    "sidecar should persist Codex session continuity through an archive in the Daytona volume",
  );
  assert.match(
    probeScript,
    /restorePersistentCodexSessions/,
    "sidecar should restore persisted Codex sessions before thread/resume",
  );
  assert.match(
    probeScript,
    /persistCodexSessions/,
    "sidecar should persist Codex sessions after a successful primary turn",
  );
	  assert.match(
	    probeScript,
	    /rmSync\(codexHome, \{ recursive: true, force: true \}\)/,
	    "sidecar should clean up only the sandbox-local runtime home",
	  );
	  assert.match(
	    probeScript,
	    /sandboxPolicyType/,
	    "sidecar should return explicit sandbox policy evidence",
	  );
	  assert.match(
	    probeScript,
	    /sandboxPolicyNetworkAccess = turnSandboxPolicy\.networkAccess === true/,
	    "sidecar should record the requested network access state for every Codex turn",
	  );

  console.log("codex_harness_thread_binding_proof: ok");
}

main();
