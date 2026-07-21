import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readText(path: string | URL): string {
  return readFileSync(path, "utf8");
}

function assertIncludes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), `expected ${label} to include ${needle}`);
}

function assertExcludes(haystack: string, needle: string, label: string) {
  assert.ok(!haystack.includes(needle), `expected ${label} to exclude ${needle}`);
}

function main() {
  const audit = readText(new URL("../convex/communityAccessAudit.ts", import.meta.url));
  const operatorDashboard = readText(new URL("../convex/operatorDashboard.ts", import.meta.url));
  const packageJson = readText(new URL("../package.json", import.meta.url));

  assertIncludes(
    audit,
    "export const listCommunityAccessStateAuditFindingsInternal = internalQuery({",
    "community access state audit must be an internal read query",
  );
  for (const mutationMarker of [
    "ctx.db.insert",
    "ctx.db.patch",
    "ctx.db.delete",
    "internalMutation",
    "mutation({",
    "action({",
  ]) {
    assertExcludes(audit, mutationMarker, `audit must stay read-only and avoid ${mutationMarker}`);
  }

  for (const findingCode of [
    "paid_community_without_current_price_point",
    "active_membership_with_active_block",
    "active_paid_membership_without_granting_subscription",
    "active_paid_membership_with_stale_subscription_period",
    "paid_community_durable_grant_review",
    "duplicate_community_join_request_pair",
    "community_owner_join_request_forbidden",
    "community_join_request_status_invalid",
    "community_join_request_pending_fields_invalid",
    "community_join_request_denial_fields_invalid",
    "active_membership_with_join_request",
  ]) {
    assertIncludes(audit, findingCode, `audit finding ${findingCode}`);
  }
  assertIncludes(
    audit,
    "COMMUNITY_SUBSCRIPTION_STALE_GRACE_MS",
    "audit has explicit stale subscription grace window",
  );
  assertIncludes(
    audit,
    "subscriptionLooksStale(relevantSubscription, nowMs)",
    "audit checks stale paid subscriptions without changing entitlement hot path",
  );

  assertIncludes(
    operatorDashboard,
    "export const listCommunityAccessStateAuditFindings = query({",
    "operator dashboard exposes read-only audit query",
  );
  assertIncludes(
    operatorDashboard,
    "await requireOperatorAccess(ctx, args.authSubject);",
    "operator audit query is operator gated",
  );
  assertIncludes(
    operatorDashboard,
    "communityAccessAudit.listCommunityAccessStateAuditFindingsInternal",
    "operator query delegates to internal audit",
  );
  assertIncludes(
    packageJson,
    "\"check:community-access-state-audit-proof\"",
    "package script for audit proof",
  );

  console.log("community_access_state_audit_proof: ok");
}

main();
