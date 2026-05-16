import {
  assert,
  buildMaintenancePayload,
  convexRunJson,
  parseCommonOptions,
  readFlag,
  withMaintenanceToken,
} from "./staging_maintenance_cli.ts";

const options = parseCommonOptions();
const ownerId = readFlag("--owner-id");
const limit = Number(readFlag("--limit") ?? 25);

const result = withMaintenanceToken(options, (token) => {
  const before = convexRunJson(
    options,
    "stagingMaintenance:getStagingWorldFingerprint",
    buildMaintenancePayload(options, token, {
      ownerId: ownerId ?? undefined,
    }),
  );
  const cleanup = convexRunJson(
    options,
    "stagingMaintenance:cleanupCodexHarnessOperability",
    {
      maintenanceToken: token,
      nowMs: Date.now(),
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    },
  );
  const lockCanary = convexRunJson(
    options,
    "stagingMaintenance:runCodexHarnessLockContentionCanary",
    {
      maintenanceToken: token,
      nowMs: Date.now(),
    },
  );
  const after = convexRunJson(
    options,
    "stagingMaintenance:getStagingWorldFingerprint",
    buildMaintenancePayload(options, token, {
      ownerId: ownerId ?? undefined,
    }),
  );
  return { before, cleanup, lockCanary, after };
});

assert(result?.before?.codex?.operability, "before fingerprint must include Codex operability");
assert(result?.after?.codex?.operability, "after fingerprint must include Codex operability");
assert(result?.cleanup?.ok === true, "operability cleanup should succeed");
assert(
  result?.cleanup?.bridgeSessions?.ok === true,
  "expired Codex bridge session cleanup should succeed",
);
assert(
  result?.cleanup?.bindingLocks?.ok === true,
  "expired Codex binding lock cleanup should succeed",
);
assert(result?.lockCanary?.ok === true, "synthetic lock contention canary should pass");
assert(
  result?.after?.codex?.operability?.bindingLocks?.duplicateActiveKeyCount === 0,
  "Codex binding locks should not have duplicate active binding keys after cleanup/canary",
);
assert(
  result?.after?.codex?.operability?.threadBindings?.duplicateActiveKeyCount === 0,
  "Codex thread bindings should not have duplicate active binding keys after cleanup/canary",
);
assert(
  result?.lockCanary?.acquireBWhileLocked?.acquired === false,
  "second synthetic run should be blocked while first run owns the binding lock",
);
assert(
  result?.lockCanary?.acquireBWhileLocked?.reason === "binding_locked",
  "synthetic lock conflict should report binding_locked",
);
assert(
  result?.lockCanary?.releaseBWhileOwnedByA?.reason === "lock_owned_by_another_run",
  "non-owner synthetic release should fail closed",
);

console.log(
  JSON.stringify(
    {
      ok: true,
      deploymentName: options.deploymentName,
      stagingUrl: options.stagingUrl,
      owner: result.after.owner,
      project: result.after.project,
      before: result.before.codex.operability,
	      cleanup: result.cleanup,
	      lockCanary: {
        ok: result.lockCanary.ok,
        bindingKeyPresent: result.lockCanary.bindingKeyPresent,
        acquireA: result.lockCanary.acquireA,
        acquireBWhileLocked: result.lockCanary.acquireBWhileLocked,
        reenterA: result.lockCanary.reenterA,
        releaseBWhileOwnedByA: result.lockCanary.releaseBWhileOwnedByA,
        releaseA: result.lockCanary.releaseA,
        acquireBAfterRelease: result.lockCanary.acquireBAfterRelease,
        releaseBAfterAcquire: result.lockCanary.releaseBAfterAcquire,
	      },
	      after: result.after.codex.operability,
    },
    null,
    2,
  ),
);
