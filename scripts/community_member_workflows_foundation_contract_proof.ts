import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const schema = read("convex/schema.ts");
const backend = read("convex/communityMemberWorkflows.ts");
const context = read("convex/communityMembershipContextCore.ts");
const worker = read("convex/communityAgentServeWorker.ts");
const prompt = read("shared/communityAgentServePrompt.ts");
const contract = read("shared/communityMemberWorkflow.ts");
const modal = read("apps/web/src/components/WebCommunityWorkflowMilestoneModal.tsx");
const editor = read("apps/web/src/components/WebCommunityWorkflowAutomationEditor.tsx");
const picker = read("apps/web/src/components/WorkflowChannelPicker.tsx");
const dossier = read("shared/communityMemberSuccessDossier.ts");

assert.match(contract, /type: "member_contributed"/);
assert.match(contract, /type: "prompt_agent"/);
assert.match(contract, /type: "move_member"/);
assert.match(contract, /action: CommunityMemberWorkflowAction/);
assert.doesNotMatch(contract, /goal_completed|evaluate_goal|judgment|checks:/);

assert.match(schema, /communityMemberWorkflowRuns: defineTable/);
assert.match(schema, /milestoneName: v\.string\(\)/);
assert.match(schema, /by_workflow_membership_createdAt/);
assert.match(schema, /triggerType: v\.union\(v\.literal\("member_contributed"\)/);
assert.match(schema, /workflowPromptSnapshot: v\.optional\(v\.string\(\)\)/);
assert.match(schema, /fromMilestoneName: v\.string\(\)/);
assert.match(schema, /toMilestoneName: v\.optional\(v\.string\(\)\)/);
assert.doesNotMatch(schema, /automationHash/);
assert.doesNotMatch(schema, /communityMemberWorkflowMilestoneEvaluations|communityMemberWorkflowMilestonePasses|goalEvaluationId|goal_completed|evaluate_goal/);

assert.match(backend, /intakeCommunityAgentWorkflowAction/);
assert.match(backend, /transitionMemberForWorkflowAction/);
assert.match(backend, /status: "trigger_unconfigured"/);
assert.match(backend, /triggerReceiptRef[\s\S]*automation\.key/);
assert.match(backend, /community_member_workflow_requirement_duplicate/);
assert.match(backend, /community_member_workflow_requirements_incomplete/);
assert.match(backend, /const promptAutomations = automations\.filter/);
assert.match(backend, /const moveAutomations = automations\.filter/);
assert.match(backend, /fromMilestoneName: current\.milestone\.name/);
assert.match(context, /recent_workflow_activity: recentWorkflowActivity/);
assert.match(context, /serveRequest\.workflowRunId === run\._id/);
assert.match(context, /: serveRequest\.status;/);
assert.match(backend, /milestoneName: args\.current\.milestone\.name/);
assert.doesNotMatch(backend, /automationHash|sha256HexText/);
assert.doesNotMatch(backend, /contractStagingWorkflowToV1Internal|goal_completed|evaluate_goal|MilestoneEvaluation/);

assert.match(worker, /workflow_action_link_invalid/);
assert.match(worker, /surface: isWorkflowAction[\s\S]*"community_workflow_action"/);
assert.match(prompt, /community_workflow_action/);
assert.match(prompt, /authority: "community_policy"/);

assert.match(editor, /When a member posts or replies in/);
assert.match(picker, /Any channel/);
assert.doesNotMatch(picker, /<select/);
assert.match(backend, /triggerSnapshot: args\.automation\.trigger/);
assert.match(editor, /Ask agent/);
assert.match(modal, /Move on when/);
assert.match(editor, /does not wait for agent actions/);
assert.match(modal, /Add requirement/);
assert.doesNotMatch(editor, /hasOtherMove/);
assert.match(picker, /event\.stopPropagation\(\)/);
assert.doesNotMatch(modal + editor, /AI judgment|Complete when|Completion checks/);
assert.doesNotMatch(dossier, /latest_evaluation|check_statuses|checks:/);
assert.match(dossier, /recent_workflow_activity/);

console.log("community member workflows V1 contract proof passed");
