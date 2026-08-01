/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityApplicationFeeRefunds.ts",
  "./_generated/**/*.*s",
]);
const internalRefs = internal as any;

function claimArgs(overrides: Record<string, unknown> = {}) {
  return {
    providerAccountId: "acct_founder",
    providerChargeId: "ch_member",
    providerApplicationFeeId: "fee_polynet",
    providerRefundId: "re_member_1",
    amountBaseUnits: 145,
    requestedProviderRefundAmountBaseUnits: 145,
    currency: "usd",
    claimToken: "claim-1",
    nowMs: 1_000,
    ...overrides,
  };
}

test("application-fee refund claims are idempotent and reclaim only after the lease", async () => {
  const t = convexTest(schema, modules);
  const first = await t.mutation(
    internalRefs.communityApplicationFeeRefunds.claimCommunityApplicationFeeRefundInternal,
    claimArgs(),
  );
  expect(first).toMatchObject({ ok: true, duplicate: false, completed: false });

  const busy = await t.mutation(
    internalRefs.communityApplicationFeeRefunds.claimCommunityApplicationFeeRefundInternal,
    claimArgs({ claimToken: "claim-2", nowMs: 2_000 }),
  );
  expect(busy).toEqual({
    ok: false,
    errorCode: "community_application_fee_refund_in_progress",
  });

  const reclaimed = await t.mutation(
    internalRefs.communityApplicationFeeRefunds.claimCommunityApplicationFeeRefundInternal,
    claimArgs({ claimToken: "claim-3", nowMs: 5 * 60_000 + 1_001 }),
  );
  expect(reclaimed).toMatchObject({ ok: true, duplicate: true, completed: false });

  await t.mutation(
    internalRefs.communityApplicationFeeRefunds.completeCommunityApplicationFeeRefundInternal,
    {
      providerAccountId: "acct_founder",
      providerRefundId: "re_member_1",
      claimToken: "claim-3",
      providerApplicationFeeRefundId: "fr_polynet_1",
      providerRefundedAmountBaseUnits: 145,
      nowMs: 5 * 60_000 + 2_000,
    },
  );
  const duplicate = await t.mutation(
    internalRefs.communityApplicationFeeRefunds.claimCommunityApplicationFeeRefundInternal,
    claimArgs({ claimToken: "claim-4", nowMs: 5 * 60_000 + 3_000 }),
  );
  expect(duplicate).toMatchObject({ ok: true, duplicate: true, completed: true });
});

test("application-fee refund identity conflicts fail closed", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(
    internalRefs.communityApplicationFeeRefunds.claimCommunityApplicationFeeRefundInternal,
    claimArgs(),
  );
  await expect(
    t.mutation(
      internalRefs.communityApplicationFeeRefunds.claimCommunityApplicationFeeRefundInternal,
      claimArgs({ amountBaseUnits: 146, claimToken: "claim-conflict", nowMs: 500_000 }),
    ),
  ).rejects.toThrow("community_application_fee_refund_identity_conflict");
});

test("application-fee locks serialize one fee and reject the wrong releaser", async () => {
  const t = convexTest(schema, modules);
  const first = await t.mutation(
    internalRefs.communityApplicationFeeRefunds.claimCommunityApplicationFeeRefundLockInternal,
    {
      providerAccountId: "acct_founder",
      providerApplicationFeeId: "fee_polynet",
      claimToken: "lock-1",
      nowMs: 1_000,
    },
  );
  expect(first).toEqual({ ok: true, reclaimed: false });

  const busy = await t.mutation(
    internalRefs.communityApplicationFeeRefunds.claimCommunityApplicationFeeRefundLockInternal,
    {
      providerAccountId: "acct_founder",
      providerApplicationFeeId: "fee_polynet",
      claimToken: "lock-2",
      nowMs: 2_000,
    },
  );
  expect(busy).toEqual({
    ok: false,
    errorCode: "community_application_fee_refund_lock_busy",
  });

  const wrongRelease = await t.mutation(
    internalRefs.communityApplicationFeeRefunds.releaseCommunityApplicationFeeRefundLockInternal,
    {
      providerApplicationFeeId: "fee_polynet",
      claimToken: "wrong-lock",
      nowMs: 3_000,
    },
  );
  expect(wrongRelease).toEqual({
    ok: false,
    errorCode: "community_application_fee_refund_lock_claim_invalid",
  });

  await expect(
    t.mutation(
      internalRefs.communityApplicationFeeRefunds.claimCommunityApplicationFeeRefundLockInternal,
      {
        providerAccountId: "acct_other",
        providerApplicationFeeId: "fee_polynet",
        claimToken: "lock-3",
        nowMs: 2 * 60_000 + 1_001,
      },
    ),
  ).resolves.toEqual({ ok: true, reclaimed: true });
});
