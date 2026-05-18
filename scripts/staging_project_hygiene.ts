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

const result = withMaintenanceToken(options, (token) =>
  convexRunJson(
    options,
    "stagingProjectHygiene:cleanupDuplicateGeneralProjects",
    buildMaintenancePayload(options, token, {
      ownerId: ownerId ?? undefined,
      dryRun,
      nowMs: Date.now(),
    }),
  ),
);

assert(result && typeof result === "object", "staging project hygiene result missing");
assert(result.projectName === "General", "staging project hygiene must be scoped to General");
assert(result.dryRun === dryRun, "staging project hygiene dry-run flag mismatch");
assert(
  Number(result.blockedCount ?? 0) === 0,
  `staging project hygiene blocked: ${JSON.stringify(result.duplicates ?? [])}`,
);
assert(result.ok === true, `staging project hygiene failed: ${result.reason ?? "unknown"}`);
assert(
  Number(result.duplicateNameCount ?? 0) >= 1,
  "staging default General project must exist before hygiene",
);

if (dryRun) {
  for (const action of result.actions ?? []) {
    assert(
      action.action === "would_archive",
      `dry-run hygiene action should only preview archive operations: ${action.action}`,
    );
  }
} else {
  assert(
    Number(result.postDuplicateNameCount ?? 0) <= 1,
    "staging project hygiene apply must leave at most one General project",
  );
  for (const action of result.actions ?? []) {
    assert(
      action.action === "archived",
      `apply hygiene action should only archive duplicate projects: ${action.action}`,
    );
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      dryRun,
      owner: result.owner,
      projectName: result.projectName,
      canonicalProject: result.canonicalProject,
      duplicateNameCount: result.duplicateNameCount,
      duplicateCount: result.duplicateCount,
      blockedCount: result.blockedCount,
      postDuplicateNameCount: result.postDuplicateNameCount,
      actions: result.actions,
      duplicates: result.duplicates,
    },
    null,
    2,
  ),
);
