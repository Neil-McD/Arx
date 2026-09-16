/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { registerCommunityAttachmentRoutes } from "./httpCommunityAttachments";
import { listCanonicalInteractionAttachmentsForTarget } from "./communityInteractionAttachmentBridge";
import { COMMUNITY_ATTACHMENT_DOWNLOAD_PATH } from "../shared/communityAttachmentPolicy";

const modules = import.meta.glob(["./communityAttachmentDownloads.ts", "./communityChannelParticipants.ts", "./_generated/**/*.*s"]);
const resolve = "communityAttachmentDownloads:resolveInternal" as any;
afterEach(() => vi.restoreAllMocks());

async function fixture() {
  const t = convexTest(schema, modules);
  const f = await t.run(async ctx => {
    const user = (name: string) => ctx.db.insert("users", { authSubject: name, displayName: name, createdAt: 1, updatedAt: 1 });
    const ownerId = await user("owner"), memberId = await user("member"), strangerId = await user("stranger");
    const communityId = await ctx.db.insert("communities", { ownerId, name: "Files", slug: "files", visibility: "unlisted",
      entryPolicy: "open", inferenceFundingPolicy: "managed_required", createdAt: 1, updatedAt: 1 });
    const membershipId = await ctx.db.insert("communityMemberships", { communityId, userId: memberId, role: "member", active: true,
      activationSequence: 1, accessSource: "manual_grant", createdAt: 1, updatedAt: 1 });
    const channelId = await ctx.db.insert("communityChannels", { communityId, name: "Private", slug: "private", position: 1,
      accessMode: "restricted", postingPolicy: "members", status: "active", createdAt: 1, updatedAt: 1 });
    const rootId = await ctx.db.insert("communityInteractionRoots", { communityId, channelId, actorType: "human", actorUserId: memberId,
      kind: "discussion", status: "live", visibilityScope: "community", contentSummary: "Private file", replyCount: 0,
      reactionSummary: [], idempotencyKey: "one", createdAt: 1, updatedAt: 1 });
    const storageId = await ctx.storage.store(new Blob(["private fixture"], { type: "text/plain" }));
    const attachmentId = await ctx.db.insert("communityInteractionAttachments", { communityId, channelId, rootId, storageId,
      attachmentKind: "file", status: "uploaded", name: "private.txt", mimeType: "text/plain", sizeBytes: 15,
      createdByActorType: "human", createdByUserId: memberId, createdAt: 1, updatedAt: 1 });
    return { ownerId, memberId, strangerId, communityId, membershipId, channelId, rootId, storageId, attachmentId };
  });
  const grant = (active: boolean) => t.withIdentity({ subject: "owner" }).mutation("communityChannelParticipants:setParticipant" as any,
    { communityId: f.communityId, channelId: f.channelId, target: { kind: "member", userId: f.memberId }, active });
  return { t, f, grant };
}

test("private attachment projection contains neither storage capability nor inline private bytes", async () => {
  const { t, f } = await fixture();
  const rows = await t.run(ctx => listCanonicalInteractionAttachmentsForTarget({ ctx, rootId: f.rootId }));
  expect(rows[0]).toMatchObject({ id: f.attachmentId, protected_download: true });
  expect(rows[0]).not.toHaveProperty("url");
  expect(rows[0]).not.toHaveProperty("storage_id");
  expect(rows[0]).not.toHaveProperty("data_url");
  await t.run(ctx => ctx.db.patch(f.attachmentId, { channelId: undefined }));
  const legacy = await t.run(ctx => listCanonicalInteractionAttachmentsForTarget({ ctx, rootId: f.rootId }));
  expect(legacy[0]).not.toHaveProperty("url");
});

test("download resolves only current invited members, managers and live exact lineage", async () => {
  const { t, f, grant } = await fixture();
  const read = (userId = f.memberId) => t.query(resolve, { userId, attachmentId: f.attachmentId });
  expect(await read()).toBeNull();
  expect(await read(f.strangerId)).toBeNull();
  expect(await read(f.ownerId)).toMatchObject({ name: "private.txt" });
  await grant(true);
  expect(await read()).toMatchObject({ name: "private.txt" });
  await grant(false);
  expect(await read()).toBeNull();
  await grant(true);
  await t.run(ctx => ctx.db.patch(f.rootId, { status: "deleted" }));
  expect(await read()).toBeNull();
});

test("HTTP streams authorized bytes without redirect, and rechecks revocation after storage latency", async () => {
  const { t, f, grant } = await fixture();
  await grant(true);
  const routes: any[] = [];
  registerCommunityAttachmentRoutes({ http: { route: config => routes.push(config) }, httpAction: ((fn: any) => fn) as any,
    jsonResponse: (_req, status, payload) => Response.json(payload, { status }), optionsResponse: () => new Response(),
    requireAuthenticatedActor: async () => ({ ok: true, actor: { dbUserId: f.memberId, authSubject: "member" } }),
  });
  const handler = routes.find(route => route.path === COMMUNITY_ATTACHMENT_DOWNLOAD_PATH && route.method === "POST").handler;
  const request = () => new Request(`https://stage.example${COMMUNITY_ATTACHMENT_DOWNLOAD_PATH}`, {
    method: "POST", headers: { "x-polynet-attachment-id": f.attachmentId },
  });
  const provider = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("private fixture"));
  const result = await handler({ runQuery: t.query }, request());
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(result.headers.get("location")).toBeNull();
  expect(await result.text()).toBe("private fixture");
  provider.mockImplementation(async () => { await grant(false); return new Response("must not deliver"); });
  const revoked = await handler({ runQuery: t.query }, request());
  expect(revoked.status).toBe(404);
  expect(await revoked.text()).not.toContain("must not deliver");
});
