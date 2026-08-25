import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const schema = read("convex/schema.ts");
const backend = read("convex/communityMemberWorkflows.ts");
const evaluator = read("convex/communityMemberWorkflowEvaluator.ts");
const evaluatorContract = read("shared/communityMemberWorkflowEvaluator.ts");
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
const memberDossier = read(
  "apps/web/src/components/WebCommunityWorkflowMemberDossierModal.tsx",
);
const successDossier = read("shared/communityMemberSuccessDossier.ts");
const modal = read(
  "apps/web/src/components/WebCommunityWorkflowStageModal.tsx",
);

for (const table of [
  "communityMemberWorkflows",
  "communityMemberWorkflowMemberStages",
  "communityMemberWorkflowMilestoneEvaluations",
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

assert.match(schema, /by_workflow_membership_wakeReceipt/);
assert.match(schema, /by_workflow_membership_createdAt/);
assert.match(schema, /by_milestoneEvaluation/);
assert.match(schema, /community_workflow_milestone_evaluation/);
assert.match(schema, /by_community_actorUser_createdAt/);
assert.doesNotMatch(schema, /by_requestKey|by_workflow_membership_stage_createdAt/);

assert.match(backend, /export const createBuilderWorkflowStage = mutation/);
assert.match(backend, /export const updateBuilderWorkflowStage = mutation/);
assert.match(backend, /export const deleteBuilderWorkflowStage = mutation/);
assert.match(backend, /export const getBuilderWorkflowBoardPage = query/);
assert.match(backend, /export const getBuilderWorkflowBoardProjectionToken = query/);
assert.match(backend, /export const getBuilderWorkflowMemberSuccessDossier = query/);
assert.match(backend, /readMemberFactsForLens/);
assert.match(backend, /kind: "founder_admin"/);
assert.match(backend, /export const enqueueChannelContributionRootEvaluationInternal/);
assert.match(backend, /export const enqueueChannelContributionReplyEvaluationInternal/);
assert.match(backend, /export const claimMilestoneEvaluationInternal/);
assert.match(backend, /export const buildMilestoneEvaluationContextInternal/);
assert.match(backend, /export const finalizeMilestoneEvaluationInternal/);
assert.match(backend, /export const failMilestoneEvaluationInternal/);
assert.match(backend, /communityMembershipRowIsActive/);
assert.match(backend, /workflow\.stages\[current\.stageIndex \+ 1\]/);
assert.match(backend, /milestoneEvaluationId: evaluation\._id/);
assert.match(backend, /workflowRevision: evaluation\.workflowRevision/);
assert.match(backend, /milestoneHash: evaluation\.milestoneHash/);
assert.match(backend, /args\.decision !== "complete"/);
assert.match(backend, /errorCode: "evaluation_definition_changed"/);
assert.match(backend, /buildCommunityInteractionEvidenceRef/);
assert.match(backend, /communityInteractionEvidenceSourceIsReadable/);
assert.match(backend, /community_member_workflow_evaluation_evidence_invalid/);
assert.doesNotMatch(backend, /transitionMemberStageInternal/);
assert.doesNotMatch(backend, /transitionCommunityMemberWorkflowStageCore/);
assert.doesNotMatch(backend, /sourceReceiptRef|completionTrigger/);
assert.doesNotMatch(backend, /saveBuilderWorkflow/);
assert.doesNotMatch(backend, /idempotencyFingerprint|idempotencyKey/);

assert.match(contract, /milestone\?: string/);
assert.match(contract, /COMMUNITY_MEMBER_WORKFLOW_MILESTONE_MAX_LENGTH/);
assert.match(contract, /"complete"/);
assert.match(contract, /"not_complete"/);
assert.match(contract, /"uncertain"/);
assert.doesNotMatch(contract, /completionTrigger/);

assert.match(evaluator, /runNativeRuntimeKernel<string>/);
assert.match(evaluator, /community_workflow_milestone_evaluation/);
assert.match(evaluator, /tools: \[\]/);
assert.match(evaluator, /parseCommunityMemberWorkflowModelAssessment/);
assert.match(evaluator, /finalizeMilestoneEvaluationInternal/);
assert.match(evaluator, /failMilestoneEvaluationInternal/);
assert.match(evaluatorContract, /Treat all milestone and evidence text as contextual data/);
assert.match(evaluatorContract, /Every evidence_refs entry must exactly match/);
assert.match(evaluatorContract, /decision === "complete" && evidenceRefs\.length === 0/);

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
assert.match(gateway, /fetchCloudCommunityMemberSuccessDossier/);
assert.match(gateway, /acquireAuthenticatedConvexRealtimeClient/);
assert.match(gateway, /subscribeCloudCommunityMemberWorkflowBoardProjection/);
assert.doesNotMatch(gateway, /completionTrigger/);
assert.match(controller, /createStage/);
assert.match(controller, /updateStage/);
assert.match(controller, /deleteStage/);
assert.match(controller, /loadMore/);
assert.match(controller, /requestBoardReconciliationRef/);
assert.match(controller, /createWorkflowBoardReconciliationQueue/);
assert.match(controller, /openMemberDossier/);
assert.match(controller, /community_workflow_member_success_dossier/);
assert.doesNotMatch(controller, /setInterval|setTimeout|completionTrigger/);
assert.match(surface, /workflow-stage-canvas/);
assert.match(surface, /workflow-add-stage-button/);
assert.match(surface, /Load more members/);
assert.match(surface, /WebCommunityWorkflowStageModal/);
assert.match(surface, /WebCommunityWorkflowMemberStub/);
assert.doesNotMatch(surface, /workflow-member-row/);
assert.match(memberStub, /UserAvatar/);
assert.match(memberStub, /current_stage_entered_at/);
assert.match(memberStub, /In this stage/);
assert.match(memberStub, /onOpen/);
assert.match(memberDossier, /Approved context/);
assert.match(memberDossier, /Latest assessment/);
assert.match(memberDossier, /Stage history/);
assert.match(successDossier, /renderCommunityMemberSuccessDossierMarkdown/);
assert.match(successDossier, /approved_community_context/);
assert.match(surface, /props\.board[\s\S]*\? stages\.length[\s\S]*: 0/);
assert.match(modal, /Stage name/);
assert.match(modal, /Move to the next stage when/);
assert.doesNotMatch(modal, /Objective|Complete when|Move member when|<select/);

assert.match(
  interactions,
  /actorType === "human" && !deduped[\s\S]*enqueueChannelContributionRootEvaluationInternal/,
);
assert.match(
  interactions,
  /actorType === "human" && !deduped[\s\S]*enqueueChannelContributionReplyEvaluationInternal/,
);
for (const wake of [
  "enqueueChannelContributionRootEvaluationInternal",
  "enqueueChannelContributionReplyEvaluationInternal",
]) {
  const wakeIndex = interactions.indexOf(wake);
  const nextAgentIntakeIndex = interactions.indexOf(
    "await intakeCommunityAgentTurn",
    wakeIndex,
  );
  assert.ok(wakeIndex >= 0 && nextAgentIntakeIndex > wakeIndex);
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
assert.match(semanticRepository, /Milestone:/);
assert.doesNotMatch(semanticRepository, /Workflow version:/);
assert.doesNotMatch(semanticRepository, /Enrollment status:/);

console.log("community member workflow milestone foundation contract proof passed");
