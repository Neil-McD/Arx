import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const schema = read("convex/schema.ts");
const backend = read("convex/communityMemberWorkflows.ts");
const worker = read("convex/communityAgentServeWorker.ts");
const prompt = read("shared/communityAgentServePrompt.ts");
const contract = read("shared/communityMemberWorkflow.ts");
const modal = read("apps/web/src/components/WebCommunityWorkflowMilestoneModal.tsx");
const dossier = read("shared/communityMemberSuccessDossier.ts");

assert.match(contract, /type: "member_contributed"/);
assert.match(contract, /type: "prompt_agent"/);
assert.match(contract, /type: "move_member"/);
assert.match(contract, /action: CommunityMemberWorkflowAction/);
assert.doesNotMatch(contract, /goal_completed|evaluate_goal|judgment|checks:/);

assert.match(schema, /communityMemberWorkflowRuns: defineTable/);
assert.match(schema, /triggerType: v\.literal\("member_contributed"\)/);
assert.match(schema, /workflowPromptSnapshot: v\.optional\(v\.string\(\)\)/);
assert.doesNotMatch(schema, /communityMemberWorkflowMilestoneEvaluations|communityMemberWorkflowMilestonePasses|goalEvaluationId|goal_completed|evaluate_goal/);

assert.match(backend, /intakeCommunityAgentWorkflowAction/);
assert.match(backend, /transitionMemberForWorkflowAction/);
assert.match(backend, /status: "trigger_unconfigured"/);
assert.match(backend, /triggerReceiptRef[\s\S]*automation\.key/);
assert.doesNotMatch(backend, /contractStagingWorkflowToV1Internal|goal_completed|evaluate_goal|MilestoneEvaluation/);

assert.match(worker, /workflow_action_link_invalid/);
assert.match(worker, /surface: isWorkflowAction[\s\S]*"community_workflow_action"/);
assert.match(prompt, /community_workflow_action/);
assert.match(prompt, /authority: "community_policy"/);

assert.match(modal, /Member contributes/);
assert.match(modal, /Prompt community agent/);
assert.match(modal, /Move to next milestone/);
assert.doesNotMatch(modal, /AI judgment|Complete when|Completion checks/);
assert.doesNotMatch(dossier, /latest_evaluation|check_statuses|checks:/);

console.log("community member workflows V1 contract proof passed");
