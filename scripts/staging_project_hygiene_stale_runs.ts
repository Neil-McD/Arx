import {
  assert,
  buildMaintenancePayload,
  convexRunJson,
  hasFlag,
  parseCommonOptions,
  readFlag,
  withMaintenanceToken,
} from "./staging_maintenance_cli.ts";

const options = parseCommonOptions();
const ownerId = readFlag("--owner-id");
const apply = hasFlag("--apply");
const dryRun = !apply;
const limit = Number(readFlag("--limit") ?? 20);
const staleAfterMs = Number(readFlag("--stale-after-ms") ?? 15 * 60 * 1000);

const result = withMaintenanceToken(options, (token) =>
  convexRunJson(
    options,
    "stagingProjectHygiene:reconcileStaleDuplicateProjectRuntimeRuns",
    buildMaintenancePayload(options, token, {
      ownerId: ownerId ?? undefined,
      dryRun,
      nowMs: Date.now(),
      staleAfterMs: Number.isFinite(staleAfterMs) ? staleAfterMs : undefined,
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    }),
  ),
);

assert(result && typeof result === "object", "stale run hygiene result missing");
assert(result.projectName === "General", "stale run hygiene must be scoped to General");
assert(result.dryRun === dryRun, "stale run hygiene dry-run flag mismatch");
assert(result.ok === true, `stale run hygiene blocked: ${result.reason ?? "unknown"}`);
assert(
  Number(result.freshActiveRunCount ?? 0) === 0,
  "stale run hygiene must not reconcile fresh active runtime runs",
);
assert(
  Array.isArray(result.nonRuntimeBlockedProjects) &&
    result.nonRuntimeBlockedProjects.length === 0,
  "stale run hygiene must not run while non-runtime duplicate blockers remain",
);

if (dryRun) {
  assert(
    Number(result.reconciledCount ?? 0) === 0,
    "dry-run stale run hygiene must not reconcile rows",
  );
} else {
  assert(
    Number(result.reconciledCount ?? 0) === Number(result.staleCandidateCount ?? 0),
    "apply stale run hygiene should reconcile every stale candidate in the bounded plan",
  );
  assert(
    Number(result.after?.staleCandidateCount ?? 0) === 0,
    "apply stale run hygiene should leave no stale runtime candidates",
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      dryRun,
      owner: result.owner,
      projectName: result.projectName,
      duplicateNameCount: result.duplicateNameCount,
      duplicateCount: result.duplicateCount,
      staleAfterMs: result.staleAfterMs,
      staleCandidateCount: result.staleCandidateCount,
      freshActiveRunCount: result.freshActiveRunCount,
      reconciledCount: result.reconciledCount,
      candidates: result.candidates,
      reconciled: result.reconciled ?? [],
      after: result.after
        ? {
            staleCandidateCount: result.after.staleCandidateCount,
            freshActiveRunCount: result.after.freshActiveRunCount,
          }
        : null,
    },
    null,
    2,
  ),
);
