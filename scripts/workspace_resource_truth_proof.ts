import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DEFAULT_WORKSPACE_VOLUME_RETENTION_STATE,
  isWorkspaceProjectDisplayable,
  isWorkspaceProjectInactiveStatus,
  normalizeWorkspaceVolumeRetentionState,
  resolveWorkspaceProjectResourceTruth,
  WORKSPACE_VOLUME_RETENTION_STATES,
} from "../shared/workspaceProjectResources.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

assert.deepEqual(
  WORKSPACE_VOLUME_RETENTION_STATES,
  ["active", "suspended", "pending_delete", "deleted"],
  "volume retention states must stay explicit and small",
);
assert.equal(DEFAULT_WORKSPACE_VOLUME_RETENTION_STATE, "active");
assert.equal(normalizeWorkspaceVolumeRetentionState("PENDING_DELETE"), "pending_delete");
assert.equal(normalizeWorkspaceVolumeRetentionState("unexpected"), "active");
assert.equal(isWorkspaceProjectInactiveStatus("archived"), true);
assert.equal(isWorkspaceProjectInactiveStatus("staging_archived_duplicate"), true);
assert.equal(isWorkspaceProjectInactiveStatus("deleted"), true);
assert.equal(isWorkspaceProjectDisplayable({ status: "active" }), true);
assert.equal(isWorkspaceProjectDisplayable({ status: "staging_archived_duplicate" }), false);

const truth = resolveWorkspaceProjectResourceTruth({
  providerVolumeId: "pn-p-test-v",
  providerVolumeProviderId: "blaxel",
  providerVolumeState: "active",
  providerVolumeLastSeenAt: 123,
  workspaceVolumeRetentionState: "pending_delete",
  workspaceVolumeRetainUntil: 456,
  workspaceVolumeDeleteAfter: 789,
  workspaceVolumeDeletionWarningSentAt: 654,
  workspaceVolumeDeletedAt: null,
  workspaceVolumeDeletionReason: "free_retention_expired",
  providerSandboxId: "pn-p-test",
  providerSandboxProviderId: "blaxel",
  providerSandboxState: "standby",
  providerSandboxLastSeenAt: 321,
});
assert.equal(truth.volume.providerId, "blaxel");
assert.equal(truth.volume.resourceId, "pn-p-test-v");
assert.equal(truth.volume.providerState, "active");
assert.equal(truth.volume.retentionState, "pending_delete");
assert.equal(truth.volume.retainUntil, 456);
assert.equal(truth.volume.deleteAfter, 789);
assert.equal(truth.volume.deletionWarningSentAt, 654);
assert.equal(truth.volume.deletionReason, "free_retention_expired");
assert.equal(truth.sandbox.providerId, "blaxel");
assert.equal(truth.sandbox.resourceId, "pn-p-test");
assert.equal(truth.sandbox.providerState, "standby");

const schema = read("convex/schema.ts");
assert.match(
  schema,
  /workspaceVolumeRetentionState: v\.optional\([\s\S]*v\.literal\("active"\)[\s\S]*v\.literal\("suspended"\)[\s\S]*v\.literal\("pending_delete"\)[\s\S]*v\.literal\("deleted"\)/,
  "cloudProjects schema must explicitly model volume retention state",
);
assert.match(
  schema,
  /by_workspaceVolumeRetentionState_deleteAfter[\s\S]*"workspaceVolumeRetentionState"[\s\S]*"workspaceVolumeDeleteAfter"/,
  "cloudProjects schema must index pending volume retention cleanup",
);
for (const field of [
  "workspaceVolumeRetainUntil",
  "workspaceVolumeDeleteAfter",
  "workspaceVolumeDeletionWarningSentAt",
  "workspaceVolumeDeletedAt",
  "workspaceVolumeDeletionReason",
  "providerVolumeState",
  "providerVolumeLastSeenAt",
]) {
  assert.match(schema, new RegExp(`${field}: v\\.optional`), `schema must include ${field}`);
}

const projects = read("convex/projects.ts");
assert.match(
  projects,
  /providerVolumeState: "active"[\s\S]*providerVolumeLastSeenAt: nowMs[\s\S]*workspaceVolumeRetentionState: DEFAULT_WORKSPACE_VOLUME_RETENTION_STATE/,
  "volume attachment must stamp provider evidence and reset retention state",
);
assert.match(
  projects,
  /workspaceVolumeDeleteAfter: undefined[\s\S]*workspaceVolumeDeletedAt: undefined[\s\S]*workspaceVolumeDeletionReason: undefined/,
  "volume attachment must clear pending deletion metadata",
);
assert.match(
  projects,
  /providerVolumeId: undefined[\s\S]*workspaceVolumeRetentionState: DEFAULT_WORKSPACE_VOLUME_RETENTION_STATE/,
  "new projects must initialize active volume retention policy",
);
assert.match(
  projects,
  /existingRows[\s\S]*\.filter\(isWorkspaceProjectDisplayable\)[\s\S]*\.sort/,
  "default project resolution must ignore inactive archived/deleted project rows",
);
assert.match(
  projects,
  /return rows[\s\S]*\.filter\(isWorkspaceProjectDisplayable\)[\s\S]*\.sort/,
  "browser-facing project lists must hide inactive archived/deleted project rows",
);

const threads = read("convex/threads.ts");
assert.doesNotMatch(
  threads,
  /db\.insert\("cloudProjects"|DEFAULT_WORKSPACE_VOLUME_RETENTION_STATE/,
  "thread persistence must not create implicit default projects or own project volume-retention initialization",
);

const gateway = read("shared/cloudProjectsGateway.ts");
assert.match(
  gateway,
  /resolveWorkspaceProjectResourceTruth\(row\)/,
  "web project gateway must project normalized resource truth",
);
assert.match(
  gateway,
  /volume_retention_state: normalizeWorkspaceVolumeRetentionState/,
  "web project gateway must expose normalized retention state",
);

const docs = read("docs/workspace-computer-provider-contract.md");
assert.match(
  docs,
  /## Project Resource Truth[\s\S]*Allowed volume retention states are `active`, `suspended`, `pending_delete`, and\s+`deleted`/,
  "workspace provider contract must document project resource truth",
);

console.log("workspace_resource_truth_proof: ok");
