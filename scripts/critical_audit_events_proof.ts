import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();

async function readRepoFile(relativePath: string): Promise<string> {
  return await readFile(path.join(rootDir, relativePath), "utf8");
}

function assertContains(source: string, pattern: RegExp, message: string) {
  assert.match(source, pattern, message);
}

const schema = await readRepoFile("convex/schema.ts");
const criticalAudit = await readRepoFile("convex/criticalAudit.ts");
const builderCommerce = await readRepoFile("convex/builderCommerce.ts");
const communityCommerce = await readRepoFile("convex/communityCommerce.ts");
const billingCore = await readRepoFile("convex/billingCore.ts");
const httpBilling = await readRepoFile("convex/httpBilling.ts");
const account = await readRepoFile("convex/account.ts");

assertContains(schema, /criticalAuditEvents: defineTable/, "critical audit table must exist");
for (const indexName of [
  "by_eventKey",
  "by_type_createdAt",
  "by_severity_createdAt",
  "by_actor_createdAt",
  "by_community_createdAt",
  "by_providerObject",
]) {
  assertContains(schema, new RegExp(`\\.index\\("${indexName}"`), `missing critical audit index ${indexName}`);
}

assertContains(
  criticalAudit,
  /recordCriticalAuditEventInternal = internalMutation/,
  "critical audit internal mutation must exist",
);
assertContains(
  criticalAudit,
  /withIndex\("by_eventKey"/,
  "critical audit helper must dedupe by eventKey",
);
assertContains(
  criticalAudit,
  /recordCriticalAuditEventBestEffort/,
  "critical audit helper must expose best-effort recording",
);
assertContains(
  criticalAudit,
  /listCriticalAuditEventsInternal = internalQuery/,
  "critical audit internal read model must exist",
);

const requiredEvents = [
  "builder_checkout_created",
  "builder_checkout_attached_to_stripe",
  "builder_subscription_synced",
  "builder_entitlement_granted",
  "builder_entitlement_revoked",
  "community_checkout_created",
  "community_checkout_attached_to_stripe",
  "community_subscription_synced",
  "community_purchase_claim_created",
  "community_purchase_claim_redeemed",
  "stripe_webhook_received",
  "stripe_webhook_processed",
  "stripe_webhook_failed",
  "stripe_connect_account_synced",
  "account_delete_blocked",
  "account_delete_completed",
];

for (const eventType of requiredEvents) {
  assertContains(criticalAudit, new RegExp(`"${eventType}"`), `critical event type missing from constants: ${eventType}`);
}

for (const [fileName, source, eventTypes] of [
  [
    "convex/builderCommerce.ts",
    builderCommerce,
    [
      "builder_checkout_created",
      "builder_checkout_attached_to_stripe",
      "builder_subscription_synced",
      "builder_entitlement_granted",
      "builder_entitlement_revoked",
      "stripe_connect_account_synced",
    ],
  ],
  [
    "convex/communityCommerce.ts",
    communityCommerce,
    [
      "community_checkout_created",
      "community_checkout_attached_to_stripe",
      "community_purchase_claim_created",
      "community_purchase_claim_redeemed",
    ],
  ],
  ["convex/billingCore.ts", billingCore, ["community_subscription_synced"]],
  [
    "convex/httpBilling.ts",
    httpBilling,
    ["stripe_webhook_received", "stripe_webhook_processed", "stripe_webhook_failed"],
  ],
  ["convex/account.ts", account, ["account_delete_blocked", "account_delete_completed"]],
] as const) {
  assertContains(source, /recordCriticalAudit/, `${fileName} must use critical audit recording`);
  for (const eventType of eventTypes) {
    assertContains(source, new RegExp(`eventType: "${eventType}"`), `${fileName} missing ${eventType}`);
  }
}

console.log("critical_audit_events_proof: ok");
