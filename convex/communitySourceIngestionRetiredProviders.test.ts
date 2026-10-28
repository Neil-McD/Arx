/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityResources.ts",
  "./_generated/**/*.*s",
]);

test("retired GitHub and Google Drive sources are neither pending nor failed ingestion work", async () => {
  const t = convexTest(schema, modules);
  const nowMs = 1_760_000_000_000;
  const { communityId } = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "retired-provider-owner",
      displayName: "Retired provider owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "retired-provider",
      name: "Retired provider",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const source = (title: string, extra: Record<string, unknown>) => ctx.db.insert("communityResources", {
      communityId,
      createdByUserId: ownerId,
      type: "post",
      role: "source",
      status: "review",
      title,
      pinned: false,
      createdAt: nowMs,
      updatedAt: nowMs,
      ...extra,
    });
    await source("Drive doc", {
      sourceIngestionKind: "google_drive",
      sourceIngestionStatus: "queued",
      sourceExternalProvider: "google_drive",
      sourceExternalId: "drive-file",
    });
    await source("Repo file", {
      sourceIngestionKind: "github",
      sourceIngestionStatus: "processing",
      sourceExternalProvider: "github",
      sourceExternalId: "owner/repo:main:README.md",
      url: "https://github.com/owner/repo/blob/main/README.md",
    });
    await source("Old Drive doc", {
      sourceIngestionKind: "google_drive",
      sourceIngestionStatus: "failed",
      sourceExternalProvider: "google_drive",
      sourceExternalId: "drive-file-2",
    });
    await source("Link", {
      sourceIngestionKind: "url",
      sourceIngestionStatus: "queued",
      url: "https://example.com/guide",
    });
    return { ownerId, communityId };
  });

  const state = await t.withIdentity({ subject: "retired-provider-owner" })
    .query(internal.communityResources.getCommunitySourceIngestionStateInternal, {
      authSubject: "retired-provider-owner",
      communityId,
    });
  expect(state.total_sources).toBe(4);
  expect(state.pending_sources).toBe(1);
  expect(state.failed_sources).toBe(0);
  expect(state.pending_url_sources).toBe(1);
});
