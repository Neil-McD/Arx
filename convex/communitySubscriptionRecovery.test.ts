/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import {
  COMMUNITY_SUBSCRIPTION_RECOVERY_LEASE_MS,
  COMMUNITY_SUBSCRIPTION_RECOVERY_MAX_ATTEMPTS,
  communitySubscriptionRecoveryErrorCode,
  validateRecoveredCommunitySubscriptionEvent,
} from "./communitySubscriptionRecoveryCore";

const modules = import.meta.glob([
  "./communitySubscriptionRecovery.ts",
  "./_generated/**/*.*s",
]);

const NOW_MS = 1_753_000_000_000;

function recoveryIdentity(suffix: string) {
  return {
    providerAccountId: "platform",
    providerEventId: `evt_${suffix}`,
    providerEventType: "customer.subscription.updated" as const,
    providerSubscriptionId: `sub_${suffix}`,
    livemode: false,
    providerCreatedAt: NOW_MS - 10_000,
  };
}

async function beginRecovery(
  t: ReturnType<typeof convexTest>,
  suffix: string,
  leaseToken: string,
  nowMs = NOW_MS,
) {
  return await t.mutation(
    (internal as any).communitySubscriptionRecovery
      .beginCommunitySubscriptionEventRecoveryInternal,
    {
      ...recoveryIdentity(suffix),
      leaseToken,
      nowMs,
    },
  );
}

describe("community subscription event recovery", () => {
  test("deduplicates one provider event and rejects identity conflicts", async () => {
    const t = convexTest(schema, modules);
    const first = await beginRecovery(t, "dedupe", "lease_first");
    expect(first).toMatchObject({ claimed: true, status: "leased", attemptCount: 1 });

    const duplicate = await beginRecovery(
      t,
      "dedupe",
      "lease_duplicate",
      NOW_MS + 1,
    );
    expect(duplicate).toMatchObject({
      recoveryId: first.recoveryId,
      claimed: false,
      status: "leased",
      attemptCount: 1,
    });

    await expect(
      t.mutation(
        (internal as any).communitySubscriptionRecovery
          .beginCommunitySubscriptionEventRecoveryInternal,
        {
          ...recoveryIdentity("dedupe"),
          providerSubscriptionId: "sub_conflict",
          leaseToken: "lease_conflict",
          nowMs: NOW_MS + 2,
        },
      ),
    ).rejects.toThrow("community_subscription_recovery_identity_conflict");

    const rows = await t.run(async (ctx) =>
      await ctx.db.query("communitySubscriptionEventRecoveries").collect()
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("payload");
  });

  test("requeues a transient failure and fences a stale worker", async () => {
    const t = convexTest(schema, modules);
    const started = await beginRecovery(t, "retry", "lease_inline");
    const failed = await t.mutation(
      (internal as any).communitySubscriptionRecovery
        .failCommunitySubscriptionEventRecoveryInternal,
      {
        recoveryId: started.recoveryId,
        leaseToken: "lease_inline",
        errorCode: "stripe_temporarily_unavailable",
        nowMs: NOW_MS + 1,
      },
    );
    expect(failed).toMatchObject({
      ok: true,
      status: "pending",
      terminal: false,
    });
    expect(failed.nextAttemptAt).toBeGreaterThan(NOW_MS + 1);

    const claimed = await t.mutation(
      (internal as any).communitySubscriptionRecovery
        .claimDueCommunitySubscriptionEventRecoveriesInternal,
      {
        leaseTokenPrefix: "lease_repair",
        limit: 10,
        nowMs: failed.nextAttemptAt,
      },
    );
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({
      recoveryId: started.recoveryId,
      attemptCount: 2,
    });

    const staleCompletion = await t.mutation(
      (internal as any).communitySubscriptionRecovery
        .completeCommunitySubscriptionEventRecoveryInternal,
      {
        recoveryId: started.recoveryId,
        leaseToken: "lease_inline",
        outcome: "succeeded",
        nowMs: failed.nextAttemptAt + 1,
      },
    );
    expect(staleCompletion).toEqual({ ok: false, reason: "stale_lease" });

    const completed = await t.mutation(
      (internal as any).communitySubscriptionRecovery
        .completeCommunitySubscriptionEventRecoveryInternal,
      {
        recoveryId: started.recoveryId,
        leaseToken: claimed[0].leaseToken,
        outcome: "succeeded",
        nowMs: failed.nextAttemptAt + 2,
      },
    );
    expect(completed).toEqual({ ok: true, status: "succeeded" });
  });

  test("reclaims an expired lease after an interrupted worker", async () => {
    const t = convexTest(schema, modules);
    const started = await beginRecovery(t, "expired", "lease_crashed");
    const claimed = await t.mutation(
      (internal as any).communitySubscriptionRecovery
        .claimDueCommunitySubscriptionEventRecoveriesInternal,
      {
        leaseTokenPrefix: "lease_after_crash",
        limit: 10,
        nowMs: NOW_MS + COMMUNITY_SUBSCRIPTION_RECOVERY_LEASE_MS,
      },
    );
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({
      recoveryId: started.recoveryId,
      attemptCount: 2,
    });
    expect(claimed[0].leaseToken).not.toBe("lease_crashed");
  });

  test("an expired lease cannot be starved by a pending retry backlog", async () => {
    const t = convexTest(schema, modules);
    const expired = await beginRecovery(t, "expired_fair", "lease_expired_fair");
    for (const suffix of ["pending_fair_1", "pending_fair_2"]) {
      const pending = await beginRecovery(t, suffix, `lease_${suffix}`);
      await t.mutation(
        (internal as any).communitySubscriptionRecovery
          .failCommunitySubscriptionEventRecoveryInternal,
        {
          recoveryId: pending.recoveryId,
          leaseToken: `lease_${suffix}`,
          errorCode: "stripe_temporarily_unavailable",
          nowMs: NOW_MS + 1,
        },
      );
    }
    const claimed = await t.mutation(
      (internal as any).communitySubscriptionRecovery
        .claimDueCommunitySubscriptionEventRecoveriesInternal,
      {
        leaseTokenPrefix: "lease_fair_claim",
        limit: 2,
        nowMs: NOW_MS + COMMUNITY_SUBSCRIPTION_RECOVERY_LEASE_MS,
      },
    );
    expect(claimed).toHaveLength(2);
    expect(claimed.some((row: any) => row.recoveryId === expired.recoveryId))
      .toBe(true);
  });

  test("retention pruning deletes only completed work", async () => {
    const t = convexTest(schema, modules);
    const pending = await beginRecovery(t, "pending_retention", "lease_pending");
    const completed = await beginRecovery(t, "completed_retention", "lease_completed");
    await t.mutation(
      (internal as any).communitySubscriptionRecovery
        .completeCommunitySubscriptionEventRecoveryInternal,
      {
        recoveryId: completed.recoveryId,
        leaseToken: "lease_completed",
        outcome: "succeeded",
        nowMs: NOW_MS + 1,
      },
    );
    const pruned = await t.mutation(
      (internal as any).communitySubscriptionRecovery
        .pruneCommunitySubscriptionEventRecoveriesInternal,
      {
        limit: 100,
        nowMs: NOW_MS + 46 * 24 * 60 * 60 * 1_000,
      },
    );
    expect(pruned.deleted).toBe(1);
    const rows = await t.run(async (ctx) =>
      await ctx.db.query("communitySubscriptionEventRecoveries").collect()
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(pending.recoveryId);
    expect(rows[0].status).toBe("leased");
  });

  test("stops after the bounded attempt limit and records terminal audit evidence", async () => {
    const t = convexTest(schema, modules);
    const started = await beginRecovery(t, "terminal", "lease_attempt_1");
    let recoveryId = started.recoveryId;
    let leaseToken = "lease_attempt_1";
    let nowMs = NOW_MS;
    let terminalResult: any = null;

    for (let attempt = 1; attempt <= COMMUNITY_SUBSCRIPTION_RECOVERY_MAX_ATTEMPTS; attempt += 1) {
      terminalResult = await t.mutation(
        (internal as any).communitySubscriptionRecovery
          .failCommunitySubscriptionEventRecoveryInternal,
        {
          recoveryId,
          leaseToken,
          errorCode: "stripe_temporarily_unavailable",
          nowMs: nowMs + 1,
        },
      );
      if (terminalResult.terminal) break;
      nowMs = terminalResult.nextAttemptAt;
      const claimed = await t.mutation(
        (internal as any).communitySubscriptionRecovery
          .claimDueCommunitySubscriptionEventRecoveriesInternal,
        {
          leaseTokenPrefix: `lease_attempt_${attempt + 1}`,
          limit: 1,
          nowMs,
        },
      );
      expect(claimed).toHaveLength(1);
      leaseToken = claimed[0].leaseToken;
    }

    expect(terminalResult).toMatchObject({
      ok: true,
      status: "terminal",
      terminal: true,
    });
    const evidence = await t.run(async (ctx) => ({
      recovery: await ctx.db.get(recoveryId),
      audits: await ctx.db
        .query("criticalAuditEvents")
        .withIndex("by_providerObject", (q) =>
          q.eq("provider", "stripe").eq("providerObjectId", "evt_terminal"),
        )
        .collect(),
    }));
    expect(evidence.recovery).toMatchObject({
      status: "terminal",
      attemptCount: COMMUNITY_SUBSCRIPTION_RECOVERY_MAX_ATTEMPTS,
      lastErrorCode: "stripe_temporarily_unavailable",
    });
    expect(evidence.audits.some((row) => row.eventType === "stripe_webhook_failed"))
      .toBe(true);
  });

  test("recovered provider identity must match exactly and error storage is code-only", () => {
    const identity = recoveryIdentity("validate");
    expect(
      validateRecoveredCommunitySubscriptionEvent(identity, {
        id: identity.providerEventId,
        type: identity.providerEventType,
        account: null,
        livemode: identity.livemode,
        created: identity.providerCreatedAt / 1_000,
        data: { object: { id: identity.providerSubscriptionId } },
      }),
    ).toBeTruthy();
    expect(() =>
      validateRecoveredCommunitySubscriptionEvent(identity, {
        id: identity.providerEventId,
        type: identity.providerEventType,
        account: null,
        livemode: identity.livemode,
        created: identity.providerCreatedAt / 1_000,
        data: { object: { id: "sub_other" } },
      })
    ).toThrow("community_subscription_recovery_identity_conflict");
    expect(
      communitySubscriptionRecoveryErrorCode(
        new Error("Customer jane@example.test failed with a long provider message"),
      ),
    ).toBe("provider_operation_failed");
    expect(
      communitySubscriptionRecoveryErrorCode(new Error("sk_live_secret_value")),
    ).toBe("provider_operation_failed");
    expect(
      communitySubscriptionRecoveryErrorCode({ code: "whsec_secret_value" }),
    ).toBe("provider_operation_failed");
  });
});
