import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const schema = read("convex/schema.ts");
const backend = read("convex/communityMemberWorkflows.ts");
const lifecycle = read("convex/communityMembershipLifecycle.ts");
const commerce = read("convex/communityCommerce.ts");
const admin = read("convex/communityAdmin.ts");
const semanticContext = read("convex/communityCapabilityContext.ts");
const semanticRepository = read("shared/communitySemanticRepository.ts");
const contract = read("shared/communityMemberWorkflow.ts");
const gateway = read("shared/cloudCommunityMemberWorkflowsGateway.ts");
const controller = read(
  "apps/web/src/controllers/useWebCommunityWorkflowsController.ts",
);
const surface = read(
  "apps/web/src/components/WebCommunityWorkflowsSection.tsx",
);
const modal = read(
  "apps/web/src/components/WebCommunityWorkflowStageModal.tsx",
);

for (const table of [
  "communityMemberWorkflows",
  "communityMemberWorkflowMemberStages",
  "communityMemberWorkflowTransitions",
]) {
  assert.match(schema, new RegExp(`${table}: defineTable\\(`));
}
for (const retiredTable of [
  "communityMemberWorkflowVersions",
  "communityMemberWorkflowEnrollments",
  "communityMemberWorkflowEvidence",
]) {
  assert.doesNotMatch(schema, new RegExp(`${retiredTable}: defineTable\\(`));
}

assert.match(backend, /export const saveBuilderWorkflow = mutation/);
assert.match(backend, /export const getBuilderWorkflowBoard = query/);
assert.match(
  backend,
  /export async function transitionCommunityMemberWorkflowStageCore/,
);
assert.match(backend, /export const transitionMemberStageInternal/);
assert.match(backend, /communityMembershipRowIsActive/);
assert.match(backend, /idempotencyFingerprint/);
assert.match(contract, /"in_app"/);
assert.match(contract, /"time"/);
assert.match(contract, /"external"/);
assert.match(contract, /"agent"/);

for (const retiredSymbol of [
  "activateBuilderWorkflowDraft",
  "saveBuilderWorkflowDraft",
  "recordBuilderEvidence",
  "getBuilderEnrollmentDetail",
  "reconcileMembershipEnrollmentInternal",
]) {
  assert.doesNotMatch(backend, new RegExp(retiredSymbol));
}
for (const source of [lifecycle, commerce, admin]) {
  assert.doesNotMatch(
    source,
    /scheduleCommunityMemberWorkflowEnrollmentReconciliation/,
  );
}

assert.match(gateway, /saveCloudCommunityMemberWorkflow/);
assert.match(controller, /saveDefinition/);
assert.match(surface, /workflow-stage-canvas/);
assert.match(surface, /workflow-add-stage-button/);
assert.match(surface, /WebCommunityWorkflowStageModal/);
assert.match(modal, /Stage name/);
for (const retiredUi of [
  "Publish changes",
  "Start workflow",
  "Add evidence",
  "Complete workflow",
  "WorkflowMemberInspector",
]) {
  assert.doesNotMatch(surface, new RegExp(retiredUi));
}

assert.match(semanticContext, /communityMemberWorkflowMemberStages/);
assert.match(semanticRepository, /Current stage:/);
assert.doesNotMatch(semanticRepository, /Workflow version:/);
assert.doesNotMatch(semanticRepository, /Enrollment status:/);

console.log("community member workflow foundation contract proof passed");
