import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildWorkspaceAutoRechargeAttemptKey,
  computeWorkspaceAutoRechargeAttemptPlan,
  isWorkspaceAutoRechargeAttemptStatusActive,
  resolveWorkspaceAutoRechargeMonthKey,
  workspaceAutoRechargeCreditsToAmountCents,
} from "../shared/workspaceAutoRechargeAttempts.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const packageJson = read("package.json");
const schemaSource = read("convex/schema.ts");
const attemptPlannerSource = read("shared/workspaceAutoRechargeAttempts.ts");
const workspaceCreditsSource = read("convex/workspaceCredits.ts");

assert.equal(resolveWorkspaceAutoRechargeMonthKey(Date.UTC(2026, 0, 1)), "2026-01");
assert.equal(resolveWorkspaceAutoRechargeMonthKey(Date.UTC(2026, 11, 31, 23, 59)), "2026-12");
assert.equal(
  buildWorkspaceAutoRechargeAttemptKey("user_123", "2026-06", 3),
  "workspace_auto_recharge:user_123:2026-06:3",
);
assert.equal(workspaceAutoRechargeCreditsToAmountCents(2400), 2400);
assert.equal(isWorkspaceAutoRechargeAttemptStatusActive("prepared"), true);
assert.equal(isWorkspaceAutoRechargeAttemptStatusActive("processing"), true);
assert.equal(isWorkspaceAutoRechargeAttemptStatusActive("succeeded"), false);

assert.deepEqual(
  computeWorkspaceAutoRechargeAttemptPlan({
    userId: "",
    nowMs: Date.UTC(2026, 5, 1),
  }),
  {
    shouldPrepare: false,
    reason: "skip_invalid_user",
    rechargeCredits: 0,
    amountCents: 0,
    monthKey: "2026-06",
    sequence: 1,
  },
);

assert.deepEqual(
  computeWorkspaceAutoRechargeAttemptPlan({
    userId: "user_123",
    hasActiveAttempt: true,
    nowMs: Date.UTC(2026, 5, 1),
  }),
  {
    shouldPrepare: false,
    reason: "skip_active_attempt",
    rechargeCredits: 0,
    amountCents: 0,
    monthKey: "2026-06",
    sequence: 1,
  },
);

assert.equal(
  computeWorkspaceAutoRechargeAttemptPlan({
    userId: "user_123",
    settings: {
      enabled: true,
      thresholdCredits: 500,
      restoreToCredits: 2500,
      monthlyLimitCredits: 10000,
    },
    spendableCreditsBalance: 100,
    monthlySucceededRechargeCredits: 7601,
    hasCardOnFile: true,
    nowMs: Date.UTC(2026, 5, 1),
  }).reason,
  "skip_monthly_cap",
);

assert.deepEqual(
  computeWorkspaceAutoRechargeAttemptPlan({
    userId: "user_123",
    settings: {
      enabled: true,
      thresholdCredits: 500,
      restoreToCredits: 2500,
      monthlyLimitCredits: 10000,
    },
    spendableCreditsBalance: 100,
    uncollectedCreditsBalance: 0,
    pendingCardCollectionCreditsBalance: 0,
    monthlySucceededRechargeCredits: 500,
    hasCardOnFile: true,
    nowMs: Date.UTC(2026, 5, 15),
    sequence: 2,
  }),
  {
    shouldPrepare: true,
    attemptKey: "workspace_auto_recharge:user_123:2026-06:2",
    monthKey: "2026-06",
    sequence: 2,
    status: "prepared",
    rechargeCredits: 2400,
    amountCents: 2400,
    currency: "usd",
    thresholdCredits: 500,
    restoreToCredits: 2500,
    monthlyLimitCredits: 10000,
    spendableCreditsBalance: 100,
    uncollectedCreditsBalance: 0,
    pendingCardCollectionCreditsBalance: 0,
    monthlySucceededRechargeCredits: 500,
  },
);

assert.match(
  packageJson,
  /"check:workspace-auto-recharge-attempts-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/workspace_auto_recharge_attempts_proof\.ts"/,
  "package script must expose the workspace auto recharge attempts proof",
);
assert.match(schemaSource, /workspaceAutoRechargeAttempts: defineTable\(/);
for (const requiredIndex of [
  '.index("by_attemptKey", ["attemptKey"])',
  '.index("by_user_status", ["userId", "status"])',
  '.index("by_user_monthKey", ["userId", "monthKey"])',
  '.index("by_status_updatedAt", ["status", "updatedAt"])',
]) {
  assert.ok(schemaSource.includes(requiredIndex), `schema missing ${requiredIndex}`);
}
for (const requiredField of [
  "attemptKey: v.string()",
  "monthKey: v.string()",
  "rechargeCredits: v.number()",
  "amountCents: v.number()",
  "providerPaymentId: v.optional(v.string())",
  "providerIdempotencyKey: v.optional(v.string())",
]) {
  assert.ok(schemaSource.includes(requiredField), `schema missing ${requiredField}`);
}
assert.match(attemptPlannerSource, /computeWorkspaceAutoRechargeAttemptPlan/);
assert.match(attemptPlannerSource, /computeWorkspaceAutoRechargeDecision/);
assert.match(attemptPlannerSource, /skip_active_attempt/);
assert.doesNotMatch(
  attemptPlannerSource,
  /stripe|PaymentIntent|checkout\.sessions\.create|workspaceCreditBalances|purchasedCreditsBalance/i,
  "attempt planner must not execute provider payments or mutate balances",
);
assert.doesNotMatch(
  workspaceCreditsSource,
  /workspaceAutoRechargeAttempts[\s\S]*ctx\.db\.patch\([\s\S]*workspaceCreditBalances/,
  "workspace credit balance mutation must not be introduced by the attempt foundation",
);

console.log("workspace_auto_recharge_attempts_proof: ok");
