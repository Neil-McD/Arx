import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const backend = read("convex/communityMemberWorkflows.ts");
const completion = read("convex/communityWorkflowCompletionCore.ts");
const goalReview = read("convex/communityWorkflowGoalReviewCore.ts");
const modal = read("apps/web/src/components/WebCommunityWorkflowMilestoneModal.tsx");
const editor = read("apps/web/src/components/WebCommunityWorkflowAutomationEditor.tsx");
const dossier = read("apps/web/src/components/WebCommunityWorkflowMemberDossierModal.tsx");
const schema = read("convex/schema.ts");
const definitionSchema = schema.slice(schema.indexOf("communityMemberWorkflows: defineTable"), schema.indexOf("communityMemberWorkflowMemberMilestones: defineTable"));
const inputValidator = backend.slice(backend.indexOf("const automationInputValidator"), backend.indexOf("function normalizeExpectedRevision"));

assert.ok(definitionSchema.length > 0 && inputValidator.length > 0);
assert.doesNotMatch(definitionSchema, /move_member|evaluate_goal|completionGeneration/);
assert.doesNotMatch(inputValidator, /move_member|evaluate_goal|completionGeneration/);
assert.match(backend, /reconcileCompletedWorkflowActionsInternal/);
assert.match(backend, /approveBuilderMemberMilestone/);
assert.match(backend, /forceBuilderMemberMilestone/);
// Only the actions that hold the member count toward completion.
assert.match(completion, /all_actions_complete: (?:actions|holding)\.length > 0 && (?:actions|holding)\.every/);
assert.match(goalReview, /readCompletionReviewSnapshot/);
assert.doesNotMatch(modal, /Add condition|Automatic advancement \(existing system\)|Move on when/);
assert.doesNotMatch(editor, /<option value="evaluate_goal">|<option value="move_member">/);
assert.doesNotMatch(dossier, /Movement conditions|All conditions must be met/);

console.log("Community workflow active-surface contract passed.");
