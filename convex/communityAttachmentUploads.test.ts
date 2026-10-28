/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, vi, afterEach } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";
import { claimInteractionAttachmentsForTarget, resolveInteractionAttachmentClaims,
  listCanonicalInteractionAttachmentsForTarget } from "./communityInteractionAttachmentBridge";
import { registerCommunityAttachmentRoutes, prepareCommunityAttachmentStream } from "./httpCommunityAttachments";
import { detectCommunityAttachmentMime } from "../shared/communityAttachmentPolicy";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const refs = (internal as any).communityAttachmentUploads;
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
afterEach(() => vi.restoreAllMocks());

async function setup() {
  const t = convexTest(schema, modules);
  const f = await t.run(async ctx => {
    const user = async (name: string) => {
      const id = await ctx.db.insert("users", { authSubject: name, handle: name, normalizedHandle: name,
        displayName: name, email: `${name}@example.com`, emailVerifiedAt: 1, createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("userProfileDetails", { userId: id, displayName: name, avatarUrl: "https://example.com/avatar.png", createdAt: 1, updatedAt: 1 });
      for (const doc of PLATFORM_LEGAL_DOCUMENTS) await ctx.db.insert("legalAcceptances", {
        userId: id, documentKey: doc.key, documentVersion: doc.version, acceptedAt: 1, source: "test", createdAt: 1,
      });
      return id;
    };
    const ownerId = await user("owner");
    const memberId = await user("member");
    const otherId = await user("other");
    const community = (slug: string) => ctx.db.insert("communities", {
      ownerId, name: slug, slug, visibility: "unlisted", entryPolicy: "open", lifecycleStatus: "active",
      inferenceFundingPolicy: "managed_required", createdAt: 1, updatedAt: 1,
    });
    const communityId = await community("attachments");
    const otherCommunityId = await community("elsewhere");
    const membershipId = await ctx.db.insert("communityMemberships", { communityId, userId: memberId, role: "member", active: true, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("communityMemberships", { communityId, userId: otherId, role: "member", active: true, createdAt: 1, updatedAt: 1 });
    const channel = (position: number) => ctx.db.insert("communityChannels", { communityId,
      name: `Room ${position}`, slug: `room-${position}`, position, accessMode: "all_members", postingPolicy: "members", status: "active", createdAt: 1, updatedAt: 1 });
    const channelId = await channel(1);
    const otherChannelId = await channel(2);
    const root = (channelId: any, key: string) => ctx.db.insert("communityInteractionRoots", {
      communityId, channelId, actorType: "human", actorUserId: memberId, kind: "discussion", status: "live", visibilityScope: "community",
      contentSummary: "A message", replyCount: 0, reactionSummary: [], idempotencyKey: key, createdAt: 1, updatedAt: 1,
    });
    return { ownerId, memberId, otherId, communityId, otherCommunityId, membershipId, channelId, otherChannelId,
      rootId: await root(channelId, "root"), otherRootId: await root(otherChannelId, "other-root") };
  });
  const prepare = (overrides: Record<string, unknown> = {}) => t.mutation(refs.prepareInternal, {
    ownerId: f.memberId, communityId: f.communityId, channelId: f.channelId,
    messageKey: "send-one", name: "picture.png", mime: "image/png", ...overrides,
  });
  const store = () => t.run(async ctx => {
    const id = await ctx.storage.store(new Blob([PNG], { type: "image/png" }));
    // convex-test 0.0.54 omits contentType when storing blobs. Model the real
    // storage provider metadata explicitly; production validation stays strict.
    await ctx.db.patch(id as any, { contentType: "image/png" } as any);
    return id;
  });
  const upload = async (overrides: Record<string, unknown> = {}) => {
    const pending = await prepare(overrides);
    const storageId = await store();
    const attachment = await t.mutation(refs.finishInternal, { ownerId: f.memberId, attachmentId: pending.attachmentId, storageId });
    return { attachmentId: attachment.attachmentId as Id<"communityInteractionAttachments">, storageId };
  };
  const resolve = (attachmentId: any, overrides: Record<string, unknown> = {}) => t.run(ctx => resolveInteractionAttachmentClaims({
    ctx, communityId: f.communityId, actorUserId: f.memberId, messageKey: "send-one", attachments: [{ attachmentId }], ...overrides,
  }));
  return { t, f, prepare, store, upload, resolve };
}

test("canonical composer consumes server metadata once and retry does not duplicate the attachment", async () => {
  const { t, f, upload } = await setup();
  const attachment = await upload();
  const client = t.withIdentity({ subject: "member" });
  const args = { communityId: f.communityId, channelId: f.channelId, idempotencyKey: "send-one", text: "",
    attachments: [{ attachmentId: attachment.attachmentId }] };
  await client.mutation(api.communityInteractions.createCommunityInteractionComposerMessage, args);
  await client.mutation(api.communityInteractions.createCommunityInteractionComposerMessage, args);
  const row = await t.run(ctx => ctx.db.get(attachment.attachmentId));
  expect(row).toMatchObject({ status: "uploaded", sizeBytes: PNG.length, mimeType: "image/png", name: "picture.png" });
  expect(row!.rootId).toBeTruthy();
  expect(row!.contentHash).toBeTruthy();
  expect((await t.run(ctx => ctx.db.query("communityInteractionAttachments").collect()))).toHaveLength(1);
  await t.mutation(refs.cleanupInternal, { attachmentId: row!._id, cancelOwnerId: f.memberId, storageId: attachment.storageId });
  expect(await t.run(async ctx => Boolean(await ctx.storage.get(attachment.storageId)))).toBe(true);
});

test.each(["actor", "community", "message", "parent"])("rejects a claim with different %s scope", async scope => {
  const { f, upload, resolve } = await setup();
  const a = await upload();
  const overrides = scope === "actor" ? { actorUserId: f.otherId } : scope === "community" ? { communityId: f.otherCommunityId }
    : scope === "message" ? { messageKey: "send-two" } : { rootId: f.rootId };
  await expect(resolve(a.attachmentId, overrides)).rejects.toThrow("claim_invalid");
});

test("claim cannot be moved to another channel, and the failed message rolls back", async () => {
  const { t, f, upload } = await setup();
  const a = await upload();
  await expect(t.withIdentity({ subject: "member" }).mutation(api.communityInteractions.createCommunityInteractionComposerMessage, {
    communityId: f.communityId, channelId: f.otherChannelId, idempotencyKey: "send-one", text: "test",
    attachments: [{ attachmentId: a.attachmentId }],
  })).rejects.toThrow("scope_mismatch");
  expect((await t.run(ctx => ctx.db.get(a.attachmentId)))!.status).toBe("pending");
  expect(await t.run(ctx => ctx.db.query("communityInteractionRoots").collect())).toHaveLength(2);
});

test("concurrent retries produce one message and one claimed attachment", async () => {
  const { t, f, upload } = await setup();
  const a = await upload();
  const member = t.withIdentity({ subject: "member" });
  const args = { communityId: f.communityId, channelId: f.channelId, idempotencyKey: "send-one", text: "once",
    attachments: [{ attachmentId: a.attachmentId }] };
  await Promise.all([1, 2].map(() => member.mutation(api.communityInteractions.createCommunityInteractionComposerMessage, args)));
  const roots = await t.run(ctx => ctx.db.query("communityInteractionRoots").collect());
  expect(roots.filter(root => root.contentSummary === "once")).toHaveLength(1);
  const rows = await t.run(ctx => ctx.db.query("communityInteractionAttachments").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe("uploaded");
});

test.each(["human", "personal_agent", "community_agent"] as const)("%s roots and replies bind the original full payload to the retry key", async actor => {
  for (const reply of [false, true]) {
    const { t, f, upload } = await setup();
    const a = await upload(reply ? { uploadRootId: f.rootId } : {});
    const b = await upload(reply ? { uploadRootId: f.rootId } : {});
    const args = { communityId: f.communityId, channelId: f.channelId,
      ...(reply ? { rootId: f.rootId } : {}), idempotencyKey: "send-one",
      text: "same text", attachments: [{ attachmentId: a.attachmentId }] };
    const send = (overrides: Record<string, unknown> = {}) => actor === "community_agent"
      ? t.withIdentity({ subject: "member" }).mutation(internal.communityInteractions.createCommunityAgentCanonicalInteractionInternal,
          { userId: f.memberId, authSubject: "member", ...args, ...overrides })
      : t.withIdentity({ subject: "member" }).mutation(api.communityInteractions.createCommunityInteractionComposerMessage,
          { ...args, asPersonalAgent: actor === "personal_agent", ...overrides });
    await send();
    await send(); // Same attempt, including a response-lost retry, is accepted.
    for (const attachments of [[], [{ attachmentId: b.attachmentId }], args.attachments.concat({ attachmentId: b.attachmentId })]) {
      await expect(send({ attachments })).rejects.toThrow("idempotency_key_conflict");
    }
    const original = await t.run(ctx => ctx.db.get(a.attachmentId));
    expect(original?.status).toBe("uploaded");
    expect((await t.run(ctx => ctx.db.get(b.attachmentId)))?.status).toBe("pending");
    const targetId = original!.replyId ?? original!.rootId!;
    await t.run(ctx => ctx.db.patch(targetId, { contentSummary: "Edited after sending" }));
    await send(); // Editable summaries are not replay authority.
    const rows = await t.run(ctx => ctx.db.query(reply ? "communityInteractionReplies" : "communityInteractionRoots").collect());
    expect(rows.filter(row => row.composerPayloadHash)).toHaveLength(1);
  }
});

test("retry identity includes full text and canonical mentions, not a truncated summary", async () => {
  const { t, f } = await setup();
  const client = t.withIdentity({ subject: "member" });
  const args = { communityId: f.communityId, channelId: f.channelId, idempotencyKey: "full-payload",
    text: `@other @owner ${"a".repeat(2000)} original`, mentions: [{ userId: f.otherId }, { userId: f.ownerId }] };
  const send = (overrides = {}) => client.mutation(api.communityInteractions.createCommunityInteractionComposerMessage, { ...args, ...overrides });
  await send();
  await send({ mentions: [{ userId: "owner" }, { userId: "other" }] }); // Aliases and order canonicalize.
  await expect(send({ text: args.text.replace("original", "different") })).rejects.toThrow("idempotency_key_conflict");
  await expect(send({ mentions: [{ userId: f.otherId }] })).rejects.toThrow("idempotency_key_conflict");
  await expect(send({ mentions: [] })).rejects.toThrow("idempotency_key_conflict");
});

test("attachment order is part of the send and old messages without replay evidence fail closed", async () => {
  const { t, f, upload } = await setup();
  const a = await upload();
  const b = await upload();
  const client = t.withIdentity({ subject: "member" });
  const args = { communityId: f.communityId, channelId: f.channelId, idempotencyKey: "send-one", text: "ordered",
    attachments: [{ attachmentId: a.attachmentId }, { attachmentId: b.attachmentId }] };
  await client.mutation(api.communityInteractions.createCommunityInteractionComposerMessage, args);
  await expect(client.mutation(api.communityInteractions.createCommunityInteractionComposerMessage,
    { ...args, attachments: [...args.attachments].reverse() })).rejects.toThrow("idempotency_key_conflict");
  const row = await t.run(ctx => ctx.db.get(a.attachmentId));
  await t.run(ctx => ctx.db.patch(row!.rootId!, { composerPayloadHash: undefined }));
  await expect(client.mutation(api.communityInteractions.createCommunityInteractionComposerMessage, args)).rejects.toThrow("idempotency_key_conflict");
});

test("reply uploads bind to their parent and respect current reply policy", async () => {
  const { t, f, upload, prepare } = await setup();
  const a = await upload({ uploadRootId: f.rootId });
  await t.withIdentity({ subject: "member" }).mutation(api.communityInteractions.createCommunityInteractionComposerMessage, {
    communityId: f.communityId, channelId: f.channelId, rootId: f.rootId, idempotencyKey: "send-one", text: "reply",
    attachments: [{ attachmentId: a.attachmentId }],
  });
  expect((await t.run(ctx => ctx.db.get(a.attachmentId)))!.replyId).toBeTruthy();
  await t.run(ctx => ctx.db.patch(f.channelId, { replyPolicy: "disabled" }));
  await expect(prepare({ uploadRootId: f.rootId })).rejects.toThrow("unavailable");
});

test.each(["membership", "posting", "archive"])("revocation during upload (%s) rejects finalization and cleans only the pending blob", async kind => {
  const { t, f, prepare, store } = await setup();
  const a = await prepare();
  const storageId = await store();
  await t.run(ctx => kind === "membership" ? ctx.db.patch(f.membershipId, { active: false })
    : ctx.db.patch(f.channelId, kind === "posting" ? { postingPolicy: "managers" } : { status: "archived" }));
  await expect(t.mutation(refs.finishInternal, { ownerId: f.memberId, attachmentId: a.attachmentId, storageId })).rejects.toThrow();
  await t.mutation(refs.cleanupInternal, { attachmentId: a.attachmentId, cancelOwnerId: f.memberId, storageId });
  expect(await t.run(ctx => ctx.storage.get(storageId))).toBeNull();
});

test("revocation after upload but before send blocks claiming", async () => {
  const { t, f, upload } = await setup();
  const a = await upload();
  await t.run(ctx => ctx.db.patch(f.membershipId, { active: false }));
  await expect(t.withIdentity({ subject: "member" }).mutation(api.communityInteractions.createCommunityInteractionComposerMessage, {
    communityId: f.communityId, channelId: f.channelId, idempotencyKey: "send-one", text: "send",
    attachments: [{ attachmentId: a.attachmentId }],
  })).rejects.toThrow();
});

test("a reservation cannot reuse an already-owned storage object", async () => {
  const { t, f, upload, prepare } = await setup();
  const a = await upload();
  const b = await prepare({ messageKey: "send-two" });
  await expect(t.mutation(refs.finishInternal, { ownerId: f.memberId, attachmentId: b.attachmentId, storageId: a.storageId })).rejects.toThrow("storage_reused");
  await expect(t.mutation(refs.cleanupInternal, { attachmentId: b.attachmentId, cancelOwnerId: f.memberId, storageId: a.storageId })).rejects.toThrow("storage_reused");
  expect(await t.run(async ctx => Boolean(await ctx.storage.get(a.storageId)))).toBe(true);
});

test("pending upload count is bounded and expiry releases rows and bytes", async () => {
  const { t, f, prepare, upload, resolve } = await setup();
  const a = await upload();
  for (let i = 1; i < 8; i++) await prepare();
  await expect(prepare()).rejects.toThrow("pending_limit");
  await t.mutation(refs.cleanupInternal, { attachmentId: a.attachmentId });
  expect(await t.run(ctx => ctx.db.get(a.attachmentId))).not.toBeNull();
  await t.run(ctx => ctx.db.patch(a.attachmentId, { uploadExpiresAt: Date.now() - 1 }));
  await expect(resolve(a.attachmentId)).rejects.toThrow("claim_invalid");
  await t.mutation(refs.cleanupInternal, { attachmentId: a.attachmentId });
  expect(await t.run(ctx => ctx.db.get(a.attachmentId))).toBeNull();
  expect(await t.run(ctx => ctx.storage.get(a.storageId))).toBeNull();
});

test("expiry preserves ownership long enough to reclaim a late provider completion", async () => {
  const { t, f, prepare, store } = await setup();
  const a = await prepare();
  await t.run(ctx => ctx.db.patch(a.attachmentId, { uploadExpiresAt: Date.now() - 1 }));
  await t.mutation(refs.cleanupInternal, { attachmentId: a.attachmentId });
  expect(await t.run(ctx => ctx.db.get(a.attachmentId))).toMatchObject({ status: "failed" });
  const storageId = await store(); // Provider completes AFTER the expiry job.
  await expect(t.mutation(refs.finishInternal, { ownerId: f.memberId, attachmentId: a.attachmentId, storageId })).rejects.toThrow("upload_expired");
  await t.mutation(refs.cleanupInternal, { attachmentId: a.attachmentId, cancelOwnerId: f.otherId, storageId });
  expect(await t.run(async ctx => Boolean(await ctx.storage.get(storageId)))).toBe(true);
  await expect(t.mutation(refs.cleanupInternal, { attachmentId: a.attachmentId, storageId })).rejects.toThrow("cleanup_scope_mismatch");
  await t.mutation(refs.cleanupInternal, { attachmentId: a.attachmentId, cancelOwnerId: f.memberId, storageId });
  expect(await t.run(ctx => ctx.storage.get(storageId))).toBeNull();
  expect(await t.run(ctx => ctx.db.get(a.attachmentId))).toBeNull();
});

test("empty cancellations retain bounded tombstones without scheduling a cleanup loop", async () => {
  const { t, f, prepare } = await setup();
  const a = await prepare();
  const cancel = () => t.mutation(refs.cleanupInternal, { attachmentId: a.attachmentId, cancelOwnerId: f.memberId });
  await cancel();
  await cancel();
  expect(await t.run(ctx => ctx.db.get(a.attachmentId))).toMatchObject({ status: "failed" });
  expect(await t.run(ctx => ctx.db.system.query("_scheduled_functions").collect())).toHaveLength(2);
  await t.run(ctx => ctx.db.patch(a.attachmentId, { uploadExpiresAt: Date.now() - 31 * 60 * 1000 }));
  await t.mutation(refs.cleanupInternal, { attachmentId: a.attachmentId });
  expect(await t.run(ctx => ctx.db.get(a.attachmentId))).toBeNull();
});

test("cleanup rejects a different blob for an already stored reservation and missing claims never grant deletion", async () => {
  const { t, f, upload, store } = await setup();
  const a = await upload();
  const storageId = await store();
  await expect(t.mutation(refs.cleanupInternal, { attachmentId: a.attachmentId, cancelOwnerId: f.memberId, storageId })).rejects.toThrow("cleanup_scope_mismatch");
  await t.mutation(refs.cleanupInternal, { attachmentId: a.attachmentId, cancelOwnerId: f.memberId });
  await t.mutation(refs.cleanupInternal, { attachmentId: a.attachmentId, cancelOwnerId: f.memberId, storageId });
  expect(await t.run(async ctx => Boolean(await ctx.storage.get(storageId)))).toBe(true);
});

test("duplicate references, raw storage IDs and inline persistence fail closed", async () => {
  const { t, f, upload, resolve } = await setup();
  const a = await upload();
  await expect(resolve(a.attachmentId, { attachments: [{ attachmentId: a.attachmentId }, { attachmentId: a.attachmentId }] })).rejects.toThrow("duplicate");
  for (const attachment of [{ storageId: a.storageId }, { data_url: "data:image/png;base64,abc" }]) {
    await expect(t.withIdentity({ subject: "member" }).mutation(api.communityInteractions.createCommunityInteractionComposerMessage, {
      communityId: f.communityId, channelId: f.channelId, idempotencyKey: "send-one", text: "send", attachments: [attachment],
    } as any)).rejects.toThrow();
  }
});

test("the cached client's old inline attachment shape is refused with a reattach message", async () => {
  const { t, f, upload } = await setup();
  const a = await upload();
  await expect(t.withIdentity({ subject: "member" }).mutation(api.communityInteractions.createCommunityInteractionComposerMessage, {
    communityId: f.communityId, channelId: f.channelId, idempotencyKey: "send-old", text: "send",
    attachments: [{ name: "old.png", type: "image", size: PNG.length, storageId: a.storageId }],
  } as any)).rejects.toThrow("reattach");
});

test("deleted canonical attachments are not listed", async () => {
  const { t, f, upload, resolve } = await setup();
  const a = await upload();
  const claims = await resolve(a.attachmentId);
  await t.run(ctx => claimInteractionAttachmentsForTarget({ ctx, communityId: f.communityId, rootId: f.rootId,
    actorUserId: f.memberId, nowMs: Date.now(), attachments: claims, messageKey: "send-one" }));
  await t.run(ctx => ctx.db.patch(a.attachmentId, { status: "deleted" }));
  expect(await t.run(ctx => listCanonicalInteractionAttachmentsForTarget({ ctx, rootId: f.rootId }))).toEqual([]);
});

test("storage metadata, not request metadata, determines size and must match the server-detected MIME", async () => {
  const { t, f, prepare } = await setup();
  const a = await prepare();
  const storageId = await t.run(ctx => ctx.storage.store(new Blob(["wrong type"], { type: "text/plain" })));
  await expect(t.mutation(refs.finishInternal, { ownerId: f.memberId, attachmentId: a.attachmentId, storageId })).rejects.toThrow("metadata_invalid");
});

test("HTTP upload streams bytes and returns a claim, not a storage capability", async () => {
  const { t, f } = await setup();
  const routes: any[] = [];
  registerCommunityAttachmentRoutes({ http: { route: config => routes.push(config) }, httpAction: ((fn: any) => fn) as any,
    jsonResponse: (_req, status, payload) => Response.json(payload, { status }), optionsResponse: () => new Response(),
    requireAuthenticatedActor: async () => ({ ok: true, actor: { dbUserId: f.memberId, authSubject: "member" } }),
  });
  const provider = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    const blob = await new Response(init?.body, { headers: init?.headers }).blob();
    const storageId = await t.run(async ctx => {
      const id = await ctx.storage.store(blob);
      await ctx.db.patch(id as any, { contentType: blob.type } as any);
      return id;
    });
    return Response.json({ storageId });
  });
  const req = new Request("https://example.com/runtime/community_attachment_upload", { method: "POST", body: PNG,
    headers: { "content-type": "image/png", "x-polynet-community-id": f.communityId,
      "x-polynet-channel-id": f.channelId, "x-polynet-message-key": "send-one", "x-polynet-file-name": "image.png" } });
  const response = await routes.find(route => route.method === "POST" && route.path.endsWith("community_attachment_upload")).handler({ runMutation: t.mutation }, req);
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.attachment).toMatchObject({ mime: "image/png", size: PNG.length });
  expect(result.attachment.attachmentId).toBeTruthy();
  expect(JSON.stringify(result)).not.toMatch(/storageId|uploadUrl/);
  expect(provider).toHaveBeenCalledTimes(1);
});

test("HTTP failure cleanup reconciles a blob returned after its reservation expires", async () => {
  const { t, f, store } = await setup();
  const routes: any[] = [];
  registerCommunityAttachmentRoutes({ http: { route: config => routes.push(config) }, httpAction: ((fn: any) => fn) as any,
    jsonResponse: (_req, status, payload) => Response.json(payload, { status }), optionsResponse: () => new Response(),
    requireAuthenticatedActor: async () => ({ ok: true, actor: { dbUserId: f.memberId, authSubject: "member" } }),
  });
  let storedId: Id<"_storage"> | undefined;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    await new Response(init?.body).arrayBuffer();
    const row = (await t.run(ctx => ctx.db.query("communityInteractionAttachments").collect()))[0];
    await t.run(ctx => ctx.db.patch(row._id, { uploadExpiresAt: Date.now() - 1 }));
    await t.mutation(refs.cleanupInternal, { attachmentId: row._id });
    storedId = await store();
    return Response.json({ storageId: storedId });
  });
  const response = await routes.find(route => route.method === "POST" && route.path.endsWith("community_attachment_upload")).handler({ runMutation: t.mutation },
    new Request("https://example.com/runtime/community_attachment_upload", { method: "POST", body: PNG,
      headers: { "content-type": "image/png", "x-polynet-community-id": f.communityId,
        "x-polynet-channel-id": f.channelId, "x-polynet-message-key": "late-send", "x-polynet-file-name": "image.png" } }));
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(storedId).toBeTruthy();
  expect(await t.run(ctx => ctx.storage.get(storedId!))).toBeNull();
  expect(await t.run(ctx => ctx.db.query("communityInteractionAttachments").collect())).toHaveLength(0);
});

test("stream caps unknown files despite missing Content-Length", async () => {
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(5 * 1024 * 1024 + 1)); controller.close(); } });
  await expect(prepareCommunityAttachmentStream(new Request("https://example.com", {
    method: "POST", body, duplex: "half",
  } as RequestInit))).rejects.toThrow("too_large");
});

test("media classification comes from magic bytes and opaque files cannot become inline images", () => {
  expect(detectCommunityAttachmentMime(PNG, "application/octet-stream")).toBe("image/png");
  expect(() => detectCommunityAttachmentMime(new TextEncoder().encode("<svg>bad</svg>"), "image/svg+xml")).toThrow("content_invalid");
  expect(detectCommunityAttachmentMime(new TextEncoder().encode("<script>bad</script>"), "text/html")).toBe("application/octet-stream");
});

test("a fully streamed 50 MiB media file is admitted without collecting its bytes in the handler; overflow is rejected", async () => {
  for (const extra of [0, 1]) {
    const chunk = new Uint8Array(1024 * 1024);
    chunk.set(new TextEncoder().encode("ftypisom"), 4);
    let remaining = 50;
    const body = new ReadableStream({ pull(controller) {
      if (remaining-- > 0) { controller.enqueue(chunk); return; }
      if (remaining === -1 && extra) { controller.enqueue(new Uint8Array(1)); return; }
      controller.close();
    } });
    const upload = await prepareCommunityAttachmentStream(new Request("https://example.com", { method: "POST", body,
      headers: { "content-type": "video/mp4" }, duplex: "half" } as RequestInit));
    const consume = async () => {
      const reader = upload.stream.getReader();
      while (!(await reader.read()).done) { /* Drain without buffering. */ }
    };
    if (extra) await expect(consume()).rejects.toThrow("too_large");
    else { await consume(); expect(upload.bytesReceived()).toBe(50 * 1024 * 1024); }
  }
});

test("an unauthorized HTTP upload never reaches storage and removes its reservation if access is revoked during streaming", async () => {
  const { t, f } = await setup();
  const routes: any[] = [];
  let authorized = false;
  registerCommunityAttachmentRoutes({ http: { route: config => routes.push(config) }, httpAction: ((fn: any) => fn) as any,
    jsonResponse: (_req, status, payload) => Response.json(payload, { status }), optionsResponse: () => new Response(),
    requireAuthenticatedActor: async () => authorized ? { ok: true, actor: { dbUserId: f.memberId, authSubject: "member" } }
      : { ok: false, response: new Response(null, { status: 401 }) },
  });
  let storageId: any;
  const provider = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    const blob = await new Response(init?.body, { headers: init?.headers }).blob();
    storageId = await t.run(async ctx => {
      const id = await ctx.storage.store(blob);
      await ctx.db.patch(id as any, { contentType: blob.type } as any);
      await ctx.db.patch(f.membershipId, { active: false });
      return id;
    });
    return Response.json({ storageId });
  });
  const request = () => new Request("https://example.com/runtime/community_attachment_upload", { method: "POST", body: PNG,
    headers: { "content-type": "image/png", "x-polynet-community-id": f.communityId,
      "x-polynet-channel-id": f.channelId, "x-polynet-message-key": "send-one" } });
  const handler = routes.find(route => route.method === "POST" && route.path.endsWith("community_attachment_upload")).handler;
  expect((await handler({ runMutation: t.mutation }, request())).status).toBe(401);
  expect(provider).not.toHaveBeenCalled();
  authorized = true;
  expect((await handler({ runMutation: t.mutation }, request())).status).not.toBe(200);
  expect(await t.run(ctx => ctx.db.query("communityInteractionAttachments").collect())).toEqual([]);
  expect(await t.run(ctx => ctx.storage.get(storageId))).toBeNull();
});
