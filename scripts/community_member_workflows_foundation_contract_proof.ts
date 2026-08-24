import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const schema = read("convex/schema.ts");
const backend = read("convex/communityMemberWorkflows.ts");
const interactions = read("convex/communityInteractions.ts");
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
const memberStub = read(
  "apps/web/src/components/WebCommunityWorkflowMemberStub.tsx",
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

assert.match(backend, /export const createBuilderWorkflowStage = mutation/);
assert.match(backend, /export const updateBuilderWorkflowStage = mutation/);
assert.match(backend, /export const deleteBuilderWorkflowStage = mutation/);
assert.match(backend, /export const getBuilderWorkflowBoardPage = query/);
assert.match(
  backend,
  /export const getBuilderWorkflowBoardProjectionToken = query/,
);
assert.match(backend, /by_community_occurredAt/);
assert.match(
  backend,
  /export async function transitionCommunityMemberWorkflowStageCore/,
);
assert.match(backend, /export const transitionMemberStageInternal/);
assert.match(backend, /communityMembershipRowIsActive/);
assert.match(backend, /\.paginate\(/);
assert.match(backend, /by_workflow_membership_source/);
assert.match(backend, /sourceReceiptRef/);
assert.match(backend, /community_member_workflow_source_ref_type_mismatch/);
assert.match(backend, /applyChannelContributionRootTriggerInternal/);
assert.match(backend, /applyChannelContributionReplyTriggerInternal/);
assert.match(backend, /completionTrigger\.event !== "channel_contribution"/);
assert.match(
  backend,
  /in_app:community_interaction_\$\{args\.objectType\}:\$\{String\(row\._id\)\}/,
);
assert.doesNotMatch(backend, /saveBuilderWorkflow/);
assert.doesNotMatch(backend, /idempotencyFingerprint|idempotencyKey/);
assert.match(contract, /"in_app"/);
assert.match(contract, /"time"/);
assert.match(contract, /"external"/);
assert.doesNotMatch(contract, /"builder"|"system"|TRANSITION_ACTOR/);

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

assert.match(gateway, /createCloudCommunityMemberWorkflowStage/);
assert.match(gateway, /updateCloudCommunityMemberWorkflowStage/);
assert.match(gateway, /deleteCloudCommunityMemberWorkflowStage/);
assert.match(gateway, /fetchCloudCommunityMemberWorkflowBoardPage/);
assert.match(gateway, /acquireAuthenticatedConvexRealtimeClient/);
assert.match(gateway, /subscribeCloudCommunityMemberWorkflowBoardProjection/);
assert.match(controller, /createStage/);
assert.match(controller, /updateStage/);
assert.match(controller, /deleteStage/);
assert.match(controller, /loadMore/);
assert.match(controller, /requestBoardReconciliationRef/);
assert.match(controller, /createWorkflowBoardReconciliationQueue/);
assert.doesNotMatch(controller, /setInterval|setTimeout/);
assert.match(surface, /workflow-stage-canvas/);
assert.match(surface, /workflow-add-stage-button/);
assert.match(surface, /Load more members/);
assert.match(surface, /WebCommunityWorkflowStageModal/);
assert.match(surface, /WebCommunityWorkflowMemberStub/);
assert.doesNotMatch(surface, /workflow-member-row/);
assert.match(memberStub, /UserAvatar/);
assert.match(memberStub, /current_stage_entered_at/);
assert.match(memberStub, /In this stage/);
assert.match(surface, /props\.board[\s\S]*\? stages\.length[\s\S]*: 0/);
assert.match(modal, /Stage name/);
assert.match(modal, /Move member when/);
assert.match(modal, /They post or reply in a channel/);
assert.doesNotMatch(modal, /Objective|Complete when/);
assert.match(
  interactions,
  /actorType === "human" && !deduped[\s\S]*applyChannelContributionRootTriggerInternal/,
);
assert.match(
  interactions,
  /actorType === "human" && !deduped[\s\S]*applyChannelContributionReplyTriggerInternal/,
);
for (const trigger of [
  "applyChannelContributionRootTriggerInternal",
  "applyChannelContributionReplyTriggerInternal",
]) {
  const triggerIndex = interactions.indexOf(trigger);
  const nextAgentIntakeIndex = interactions.indexOf(
    "await intakeCommunityAgentTurn",
    triggerIndex,
  );
  assert.ok(triggerIndex >= 0 && nextAgentIntakeIndex > triggerIndex);
}
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
