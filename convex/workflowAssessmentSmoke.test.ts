/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";
const modules = import.meta.glob(["./workflowAssessmentSmoke.ts", "./_generated/**/*.*s"]);
afterEach(() => vi.unstubAllEnvs());
test("server entry rejects production before querying or spending", async () => {
  vi.stubEnv("CONVEX_CLOUD_URL", "https://production.convex.cloud");
  const t = convexTest(schema, modules);
  await expect(t.action((internal as any).workflowAssessmentSmoke.runInternal, {})).rejects.toThrow("assessment_smoke_staging_only");
});
test("server preflight requires existing operator-owner, creates nothing", async () => {
  vi.stubEnv("CONVEX_CLOUD_URL", "https://quick-porcupine-949.convex.cloud");
  const t = convexTest(schema, modules);
  await expect(t.query((internal as any).workflowAssessmentSmoke.inspectInternal, {})).rejects.toThrow("smoke_community_missing");
  const ids = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { authSubject: "smoke-test", createdAt: 1, updatedAt: 1 });
    const communityId = await ctx.db.insert("communities", { ownerId: userId, slug: "concierge-welcome-canary-2026-08-20-b", name: "Fixture", visibility: "unlisted", entryPolicy: "open", inferenceFundingPolicy: "managed_required", activeMemberCount: 0, createdAt: 1, updatedAt: 1 });
    return { userId, communityId };
  });
  await expect(t.query((internal as any).workflowAssessmentSmoke.inspectInternal, {})).rejects.toThrow("smoke_operator_owner_required");
  await t.run(async ctx => { await ctx.db.insert("operatorRoles", { userId: ids.userId, role: "owner", active: true, createdAt: 1, updatedAt: 1 }); });
  expect(await t.query((internal as any).workflowAssessmentSmoke.inspectInternal, {})).toEqual({ actorUserId: ids.userId, communityId: ids.communityId });
  expect(await t.run(ctx => ctx.db.query("communityMemberships").collect())).toEqual([]);
});
