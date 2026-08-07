/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityInteractionEmbedRefresh.ts",
  "./communityInteractions.ts",
  "./_generated/**/*.*s",
]);
const internalRefs = internal as any;

test("the preview recovery queue leases failed generic HTTPS links", async () => {
  const t = convexTest(schema, modules);
  const embedId = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "preview-recovery-owner",
      email: "preview-recovery@example.com",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "preview-recovery",
      name: "Preview recovery",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    return await ctx.db.insert("communityInteractionEmbeds", {
      communityId,
      embedKind: "link",
      status: "failed",
      visibilityScope: "community",
      sourceUrl: "https://us05web.zoom.us/j/89423453054",
      normalizedSourceUrl: "https://us05web.zoom.us/j/89423453054",
      provider: "us05web.zoom.us",
      nextRefreshAt: 0,
      refreshFailureCount: 1,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
  });

  const result = await t.mutation(
    internalRefs.communityInteractionEmbedRefresh.scheduleDueInteractionEmbedPreviewRefresh,
    { limit: 10 },
  );
  expect(result).toMatchObject({ scheduled: 1, limit: 10 });

  const leased = await t.run(async (ctx) => await ctx.db.get(embedId));
  expect(leased?.status).toBe("failed");
  expect(leased?.nextRefreshAt).toBeGreaterThan(Date.now());
});
