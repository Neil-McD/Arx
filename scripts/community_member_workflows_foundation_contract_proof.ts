import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const contract = read("docs/community-member-workflows-foundation-v1.md");
const schema = read("convex/schema.ts");
const workflows = read("convex/communityMemberWorkflows.ts");
const membershipLifecycle = read("convex/communityMembershipLifecycle.ts");
const communityAdmin = read("convex/communityAdmin.ts");
const communityCommerce = read("convex/communityCommerce.ts");
const capabilityContext = read("convex/communityCapabilityContext.ts");
const semanticRepository = read("shared/communitySemanticRepository.ts");
const navigation = read("shared/CommunityNav.tsx");
const surface = read(
  "apps/web/src/components/WebCommunityWorkflowsSection.tsx",
);
const controller = read(
  "apps/web/src/controllers/useWebCommunityWorkflowsController.ts",
);
const gateway = read("shared/cloudCommunityMemberWorkflowsGateway.ts");

for (const exclusion of [
  "integrations and inbound webhooks",
  "time/activity/provider triggers",
  "autonomous outreach",
  "success analytics",
  "branching or graph editing",
  "generic event bus or arbitrary community code",
]) {
  assert.match(
    contract,
    new RegExp(`- ${exclusion}`, "i"),
    `the V1 contract must explicitly exclude ${exclusion}`,
  );
}

for (const table of [
  "communityMemberWorkflows",
  "communityMemberWorkflowVersions",
  "communityMemberWorkflowEnrollments",
  "communityMemberWorkflowEvidence",
  "communityMemberWorkflowTransitions",
]) {
  assert.match(
    schema,
    new RegExp(`${table}: defineTable\\(`),
    `${table} must be canonical schema`,
  );
}

assert.match(
  workflows,
  /requireCommunityManager\(/,
  "builder workflow commands must reuse canonical community-manager authority",
);
assert.match(
  workflows,
  /community_member_workflow_enrollment_revision_conflict/,
  "member movement must fail closed on stale enrollment revisions",
);
assert.match(
  workflows,
  /community_member_workflow_active_enrollments_require_migration/,
  "version activation must not silently remap active member state",
);
assert.match(
  workflows,
  /by_version_status_stage/,
  "the current board must not mix members pinned to different versions",
);
assert.match(
  workflows,
  /idempotencyFingerprint/,
  "evidence and transitions must keep idempotency fingerprints",
);
assert.match(
  workflows,
  /ctx\.db\.insert\("communityMemberWorkflowTransitions"/,
  "stage changes must append transition history",
);
assert.match(
  membershipLifecycle,
  /reconcileMembershipEnrollmentInternal/,
  "membership activation must schedule enrollment reconciliation",
);
assert.match(
  workflows,
  /Community membership is no longer active\./,
  "membership loss must append a system-owned exit transition",
);
assert.match(
  workflows,
  /community_member_workflow_membership_inactive/,
  "member movement must revalidate current membership authority",
);
assert.match(
  communityAdmin,
  /scheduleCommunityMemberWorkflowEnrollmentReconciliation/,
  "member removal and leave paths must reconcile workflow enrollment",
);
assert.match(
  communityCommerce,
  /scheduleCommunityMemberWorkflowEnrollmentReconciliation/,
  "paid membership lifecycle changes must reconcile workflow enrollment",
);

assert.match(
  capabilityContext,
  /workflowState/,
  "the authenticated member context may project its own workflow state",
);
assert.match(
  semanticRepository,
  /## My success workflow/,
  "the private self document must render the member's workflow context",
);
assert.doesNotMatch(
  semanticRepository.slice(
    semanticRepository.indexOf("export function renderPublicMemberDocument"),
    semanticRepository.indexOf("export function renderSelfProfileDocument"),
  ),
  /workflowState|success workflow/i,
  "public member documents must not expose private workflow state",
);

assert.match(
  navigation,
  /onSelectTab\("workflows"\)[\s\S]*Workflows[\s\S]*onSelectTab\("funnel"\)/,
  "Workflows must render directly above Funnel",
);
assert.match(
  surface,
  /<UserAvatar/,
  "member rows must reuse the canonical avatar primitive",
);
assert.match(
  surface,
  /Move member/,
  "the member inspector must expose an explicit move command",
);
assert.match(
  surface,
  /Add evidence/,
  "the member inspector must expose explicit evidence capture",
);
assert.match(
  surface,
  /<h3>History<\/h3>/,
  "the member inspector must expose append-only history",
);
assert.doesNotMatch(
  surface,
  /draggable=|onDrag(Start|End|Over)/,
  "movement must not depend on drag and drop",
);
assert.match(
  controller,
  /expectedRevision:/,
  "client mutations must carry revision preconditions",
);
assert.match(
  gateway,
  /bootstrapConvexAuthenticatedClient/,
  "the browser gateway must reuse the authenticated Convex transport",
);
assert.match(
  gateway,
  /communityMemberWorkflows:getBuilderWorkflowBoard/,
  "the browser gateway must call the canonical workflow query",
);

console.log(
  "PASS: community member Workflows Foundation V1 preserves authority, evidence, privacy, and simple UI boundaries.",
);
