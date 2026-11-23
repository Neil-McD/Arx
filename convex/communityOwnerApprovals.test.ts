/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import { OWNER_APPROVAL_TTL_MS } from "./communityOwnerApprovals";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.now();

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

test("readMemberExperienceForTrustedManagerInternal reports active vs expired approval state", async () => {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet-staging.example.com");
  vi.stubEnv("POLYNET_SITES_DOMAIN", "polynet.page");
  vi.stubEnv("POLYNET_SITES_HOST_SUFFIX", "-staging");
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "owner-subject",
      displayName: "owner",
      handle: "owner",
      normalizedHandle: "owner",
      createdAt: NOW,
      updatedAt: NOW,
    } as any);
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "dawn-club",
      name: "Dawn Club",
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: NOW,
      updatedAt: NOW,
    } as any);
    await ctx.db.insert("communitySiteDeploys", {
      communityId,
      userId: ownerId,
      hostname: "dawn-club-staging.polynet.page",
      fileCount: 1,
      totalBytes: 10,
      createdAt: NOW,
    });
    const pendingId = await ctx.db.insert("communityOwnerApprovals", {
      communityId,
      kind: "member_experience",
      requestedByUserId: ownerId,
      fromValue: "app",
      toValue: "site",
      status: "pending",
      expiresAt: Date.now() + OWNER_APPROVAL_TTL_MS,
      createdAt: Date.now(),
    } as any);
    return { ownerId, communityId, pendingId };
  });

  const active = await t.query(internal.communityOwnerApprovals.readMemberExperienceForTrustedManagerInternal, {
    userId: ids.ownerId,
    communityId: ids.communityId,
  });
  expect(active).toMatchObject({
    members_use: "app",
    has_custom_site: true,
    waiting_for_owner_approval: { to: "site" },
  });

  await t.run((ctx) => ctx.db.patch(ids.pendingId as any, { expiresAt: Date.now() - 1 }));
  const expired = await t.query(internal.communityOwnerApprovals.readMemberExperienceForTrustedManagerInternal, {
    userId: ids.ownerId,
    communityId: ids.communityId,
  });
  expect(expired.waiting_for_owner_approval).toBeNull();
});
