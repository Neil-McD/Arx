import {
  assert,
  buildMaintenancePayload,
  convexRunJson,
  parseCommonOptions,
  readFlag,
  withMaintenanceToken,
} from "./staging_maintenance_cli.ts";

const options = parseCommonOptions();
const sinceMs = Number(readFlag("--since-ms") ?? 0);
const limit = Number(readFlag("--limit") ?? 20);
const threadId = readFlag("--thread-id");
const runId = readFlag("--run-id");
const ownerId = readFlag("--owner-id");
const assertResume = process.argv.includes("--assert-resume");
const requireSandboxPolicyEvidence = process.argv.includes("--require-sandbox-policy-evidence");
const rawOutput = process.argv.includes("--raw");

function eventTypes(run: any): string[] {
  return Array.isArray(run?.events)
    ? run.events.map((event: any) => String(event?.eventType ?? ""))
    : [];
}

function findEvent(run: any, eventType: string): any | null {
  return Array.isArray(run?.events)
    ? (run.events.find((event: any) => event?.eventType === eventType) ?? null)
    : null;
}

function summarizeRun(run: any) {
  const types = eventTypes(run);
  const completed = findEvent(run, "codex_harness_primary_completed");
  const resolved = findEvent(run, "codex_thread_binding_resolved");
  const lockAcquired = findEvent(run, "codex_thread_binding_lock_acquired");
  const lockConflict = findEvent(run, "codex_thread_binding_lock_conflict");
  const lockReleased = findEvent(run, "codex_thread_binding_lock_released");
  const created = findEvent(run, "codex_thread_binding_created");
  const resumed = findEvent(run, "codex_thread_binding_resumed");
  const rotated = findEvent(run, "codex_thread_binding_rotated");
  return {
    runId: run.runId,
    status: run.status,
    threadId: run.threadId,
    projectId: run.projectId,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    bindingAction: resolved?.payload?.action ?? null,
    bindingReason: resolved?.payload?.reason ?? null,
    lifecycle: created
      ? "created"
      : resumed
        ? "resumed"
        : rotated
          ? "rotated"
          : null,
    primaryThreadLifecycle:
      completed?.payload?.thread_lifecycle_action ??
      completed?.payload?.threadLifecycleAction ??
      null,
    observedCodexThreadId:
      completed?.payload?.observed_codex_thread_id ??
      created?.payload?.observed_codex_thread_id ??
      resumed?.payload?.observed_codex_thread_id ??
      rotated?.payload?.observed_codex_thread_id ??
      null,
    resumeRequestedCodexThreadId:
      completed?.payload?.resume_requested_codex_thread_id ??
      resumed?.payload?.resume_requested_codex_thread_id ??
      rotated?.payload?.resume_requested_codex_thread_id ??
      null,
    resumeAttempted:
      completed?.payload?.thread_resume_attempted ??
      completed?.payload?.resume_attempted ??
      null,
    resumeFailed:
      completed?.payload?.thread_resume_failed ??
      completed?.payload?.resume_failed ??
      null,
    resumeThreadIdMatched:
      completed?.payload?.thread_resume_thread_id_matched ??
      resumed?.payload?.resume_thread_id_matched ??
      rotated?.payload?.resume_thread_id_matched ??
      null,
    resumeErrorMessage:
      completed?.payload?.thread_resume_error_message ??
      resumed?.payload?.resume_error_message ??
      rotated?.payload?.resume_error_message ??
      null,
    codexHomeRuntimeIsolated: completed?.payload?.codex_home_runtime_isolated ?? null,
    codexSessionArchivePresent: completed?.payload?.codex_session_archive_present ?? null,
    codexSessionArchiveRestored: completed?.payload?.codex_session_archive_restored ?? null,
	    codexSessionArchivePersisted: completed?.payload?.codex_session_archive_persisted ?? null,
	    codexSessionArchiveErrorMessage:
	      completed?.payload?.codex_session_archive_error_message ?? null,
	    sandboxPolicyType: completed?.payload?.sandbox_policy_type ?? null,
	    sandboxPolicyNetworkAccess: completed?.payload?.sandbox_policy_network_access ?? null,
	    sandboxPolicyWritableRootCount:
	      completed?.payload?.sandbox_policy_writable_root_count ?? null,
	    sandboxPolicyExcludeTmpdirEnvVar:
	      completed?.payload?.sandbox_policy_exclude_tmpdir_env_var ?? null,
	    sandboxPolicyExcludeSlashTmp:
	      completed?.payload?.sandbox_policy_exclude_slash_tmp ?? null,
	    bindingLockAcquired: Boolean(lockAcquired),
    bindingLockReleased: Boolean(lockReleased),
    bindingLockConflict: Boolean(lockConflict),
	    bindingLockReason: lockAcquired?.payload?.reason ?? lockConflict?.payload?.reason ?? null,
	    duplicateBindingCount:
	      resolved?.payload?.duplicate_binding_count ??
	      created?.payload?.duplicate_binding_count ??
	      resumed?.payload?.duplicate_binding_count ??
	      rotated?.payload?.duplicate_binding_count ??
	      null,
	    repairedDuplicateBindingCount:
	      created?.payload?.repaired_duplicate_binding_count ??
	      resumed?.payload?.repaired_duplicate_binding_count ??
	      rotated?.payload?.repaired_duplicate_binding_count ??
	      null,
	    duplicateLockCount:
	      lockAcquired?.payload?.duplicate_lock_count ??
	      lockReleased?.payload?.duplicate_lock_count ??
	      lockConflict?.payload?.duplicate_lock_count ??
	      null,
    projectionFingerprint:
      resolved?.payload?.projection_fingerprint ??
      completed?.payload?.projection_fingerprint ??
      run.binding?.codexMcpProjectionFingerprint ??
      null,
    bindingCodexThreadId: run.binding?.codexThreadId ?? null,
    lastRunId: run.binding?.lastRunId ?? null,
    previousCodexThreadId: run.binding?.previousCodexThreadId ?? null,
    eventTypes: types,
  };
}

const evidence = withMaintenanceToken(options, (token) =>
  convexRunJson(
    options,
    "stagingMaintenance:getCodexThreadBindingCanaryEvidence",
    buildMaintenancePayload(options, token, {
      ownerId: ownerId ?? undefined,
      sinceMs: Number.isFinite(sinceMs) && sinceMs > 0 ? sinceMs : undefined,
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
      threadId: threadId ?? undefined,
      runId: runId ?? undefined,
    }),
  ),
);

const summaries = Array.isArray(evidence?.runs)
  ? evidence.runs.map((run: any) => summarizeRun(run))
  : [];

if (assertResume) {
  const created = summaries.find(
    (run: any) =>
      run.lifecycle === "created" &&
      run.status === "ok" &&
      run.primaryThreadLifecycle === "started" &&
      Boolean(run.observedCodexThreadId) &&
      run.bindingLockAcquired === true &&
      run.bindingLockReleased === true &&
      run.bindingLockConflict === false,
  );
  const resumed = summaries.find(
    (run: any) =>
      run.lifecycle === "resumed" &&
      run.status === "ok" &&
      run.primaryThreadLifecycle === "resumed" &&
      Boolean(run.observedCodexThreadId) &&
      run.resumeAttempted === true &&
      run.resumeFailed === false &&
      run.resumeThreadIdMatched === true &&
      run.bindingLockAcquired === true &&
      run.bindingLockReleased === true &&
      run.bindingLockConflict === false,
  );
  assert(Boolean(created), "expected at least one successful Codex binding creation run");
  assert(Boolean(resumed), "expected at least one successful Codex binding resume run");
  assert(
    created?.threadId === resumed?.threadId,
    "created and resumed runs should belong to the same PolyNet thread",
  );
  assert(
    created?.projectId === resumed?.projectId,
    "created and resumed runs should belong to the same PolyNet project",
  );
  assert(
    created?.projectionFingerprint === resumed?.projectionFingerprint,
    "created and resumed runs should use the same MCP projection fingerprint",
  );
  assert(
    created?.observedCodexThreadId === resumed?.observedCodexThreadId,
    "created and resumed runs should report the same observed Codex thread id",
  );
  assert(
    resumed?.resumeRequestedCodexThreadId === resumed?.observedCodexThreadId,
    "resumed run should request and observe the same Codex thread id",
  );
  assert(
    resumed?.resumeThreadIdMatched === true,
    "resumed run should explicitly report a matching Codex thread id",
  );
  assert(
    created?.codexSessionArchivePersisted === true &&
      resumed?.codexSessionArchiveRestored === true &&
      resumed?.codexSessionArchivePersisted === true,
    "created/resumed runs should prove session archive persistence and restore",
  );
	  assert(
	    created?.bindingLockAcquired === true &&
      resumed?.bindingLockAcquired === true &&
      created?.bindingLockReleased === true &&
      resumed?.bindingLockReleased === true &&
      created?.bindingLockConflict === false &&
      resumed?.bindingLockConflict === false,
	    "created/resumed runs should acquire and release the binding lock without conflict",
	  );
	  const sandboxEvidencePresent =
	    created?.sandboxPolicyType != null || resumed?.sandboxPolicyType != null;
	  if (requireSandboxPolicyEvidence || sandboxEvidencePresent) {
	    assert(
	      created?.sandboxPolicyType === "workspaceWrite" &&
	        resumed?.sandboxPolicyType === "workspaceWrite" &&
	        created?.sandboxPolicyNetworkAccess === false &&
	        resumed?.sandboxPolicyNetworkAccess === false &&
	        created?.sandboxPolicyWritableRootCount === 1 &&
	        resumed?.sandboxPolicyWritableRootCount === 1 &&
	        created?.sandboxPolicyExcludeTmpdirEnvVar === true &&
	        resumed?.sandboxPolicyExcludeTmpdirEnvVar === true &&
	        created?.sandboxPolicyExcludeSlashTmp === true &&
	        resumed?.sandboxPolicyExcludeSlashTmp === true,
	      "created/resumed primary turns should expose workspace-only, network-free sandbox policy evidence",
	    );
	  }
	}

console.log(
  JSON.stringify(
    {
      ok: evidence?.ok === true,
      deploymentName: options.deploymentName,
      stagingUrl: options.stagingUrl,
      filters: evidence?.filters ?? null,
      owner: evidence?.owner ?? null,
      project: evidence?.project ?? null,
	      summaries,
	      raw: rawOutput ? evidence?.runs ?? [] : undefined,
	      assertedResume: assertResume,
	      requiredSandboxPolicyEvidence: requireSandboxPolicyEvidence,
	    },
    null,
    2,
  ),
);
