/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";

// Files in direct messages (Nov 17). They were removed on Nov 5 because a send
// trusted a storage id from the browser. These tests are the abuse cases: a
// file is sendable only by the person who uploaded it, once, into the
// conversation it was reserved for, and readable only by the two people in it.
const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const refs = (internal as any).directMessageAttachments;
const dm = (api as any).directMessages;
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);

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
    const aliceId = await user("alice");
    const bobId = await user("bob");
    const daveId = await user("dave");
    const carolId = await user("carol");
    const community = (slug: string) => ctx.db.insert("communities", {
      ownerId, name: slug, slug, visibility: "unlisted", entryPolicy: "open", lifecycleStatus: "active",
      inferenceFundingPolicy: "managed_required", createdAt: 1, updatedAt: 1,
    });
    const communityId = await community("together");
    const elsewhereId = await community("elsewhere");
    for (const userId of [aliceId, bobId, daveId]) {
      await ctx.db.insert("communityMemberships", { communityId, userId, role: "member", state: "active", createdAt: 1, updatedAt: 1 });
    }
    await ctx.db.insert("communityMemberships", { communityId: elsewhereId, userId: carolId, role: "member", state: "active", createdAt: 1, updatedAt: 1 });
    return { aliceId, bobId, daveId, carolId, communityId };
  });
  const as = (name: string) => t.withIdentity({ subject: name });
  // What the HTTP handler does, without the network: reserve, store, finish.
  const upload = async (ownerId: any, scope: Record<string, unknown>, options: { finish?: boolean; contentType?: string } = {}) => {
    const prepared = await t.mutation(refs.prepareInternal, { ownerId, messageKey: "send-one", name: "picture.png", mime: "image/png", ...scope });
    if (options.finish === false) return { attachmentId: prepared.attachmentId as string, storageId: null as any };
    const storageId = await t.run(async ctx => {
      const id = await ctx.storage.store(new Blob([PNG], { type: "image/png" }));
      // convex-test omits contentType when storing blobs; model the real provider's metadata.
      await ctx.db.patch(id as any, { contentType: options.contentType ?? "image/png" } as any);
      return id;
    });
    await t.mutation(refs.finishInternal, { ownerId, attachmentId: prepared.attachmentId, storageId });
    return { attachmentId: prepared.attachmentId as string, storageId };
  };
  return { t, f, as, upload };
}

test("a first message can carry a file; both people can open it and nobody else can", async () => {
  const { t, f, as, upload } = await setup();
  const { attachmentId } = await upload(f.aliceId, { targetUserId: "bob", communityId: f.communityId });
  const sent = await as("alice").mutation(dm.sendDirectMessageToUser, {
    targetUserId: "bob", communityId: f.communityId, text: "", attachments: [{ attachment_id: attachmentId }],
  });
  // The message names the file and never a storage id or a URL.
  expect(sent.message.content_json).toEqual({ text: "", attachments: [{ id: attachmentId, name: "picture.png", type: "image", mime: "image/png", size: PNG.length }] });
  expect(JSON.stringify(sent.message)).not.toMatch(/storage|https?:/);
  // A message that is only a file still says something in the inbox.
  const inbox = await as("bob").query(dm.listMyDirectConversations, {});
  expect(JSON.stringify(inbox)).toContain("Sent a file");
  const open = (userId: any) => t.query(refs.resolveDownloadInternal, { userId, attachmentId });
  expect((await open(f.aliceId))?.name).toBe("picture.png");
  expect((await open(f.bobId))?.url).toBeTruthy();
  expect(await open(f.daveId)).toBeNull();
  expect(await open(f.carolId)).toBeNull();
  // Bob reads it back from the conversation with the same shape.
  const read = await as("bob").query(dm.listDirectMessages, { conversationId: sent.conversation.id });
  expect(JSON.stringify(read)).toContain(attachmentId);
});

test("a file is sent once, by its uploader, into the conversation it was reserved for", async () => {
  const { f, as, upload } = await setup();
  const mine = await upload(f.aliceId, { targetUserId: "bob", communityId: f.communityId });
  const bobs = await upload(f.bobId, { targetUserId: "alice", communityId: f.communityId });
  const send = (who: string, target: string, attachments: unknown[]) => as(who).mutation(dm.sendDirectMessageToUser, {
    targetUserId: target, communityId: f.communityId, text: "look", attachments,
  });
  // Someone else's upload.
  await expect(send("alice", "bob", [{ attachment_id: bobs.attachmentId }])).rejects.toThrow("dm_attachment_unavailable");
  // Reserved for Bob, sent to Dave.
  await expect(send("alice", "dave", [{ attachment_id: mine.attachmentId }])).rejects.toThrow("dm_attachment_unavailable");
  // The same file twice in one message.
  await expect(send("alice", "bob", [{ attachment_id: mine.attachmentId }, { attachment_id: mine.attachmentId }])).rejects.toThrow("dm_attachment_unavailable");
  await send("alice", "bob", [{ attachment_id: mine.attachmentId }]);
  // Already sent.
  await expect(send("alice", "bob", [{ attachment_id: mine.attachmentId }])).rejects.toThrow("dm_attachment_unavailable");
});

test("a send that names a storage id, a URL or a size is refused outright", async () => {
  const { f, as, upload } = await setup();
  const { attachmentId, storageId } = await upload(f.aliceId, { targetUserId: "bob", communityId: f.communityId });
  const send = (attachments: unknown[]) => as("alice").mutation(dm.sendDirectMessageToUser, {
    targetUserId: "bob", communityId: f.communityId, text: "look", attachments,
  });
  // The Nov 5 hole: a storage id from the browser.
  await expect(send([{ storage_id: storageId, name: "x.png", type: "image", size: 9 }])).rejects.toThrow("dm_attachments_not_supported");
  await expect(send([{ attachment_id: attachmentId, storage_id: storageId }])).rejects.toThrow("dm_attachments_not_supported");
  await expect(send([{ attachment_id: attachmentId, url: "https://example.com/x.png" }])).rejects.toThrow("dm_attachments_not_supported");
  await expect(send(["not-an-object"])).rejects.toThrow("dm_attachments_not_supported");
  await expect(send(Array.from({ length: 9 }, () => ({ attachment_id: attachmentId })))).rejects.toThrow("dm_attachment_limit");
  await expect(send([{ attachment_id: "not-an-id" }])).rejects.toThrow("dm_attachment_unavailable");
});

test("an upload that never finished, or whose bytes are not what was reserved, cannot be sent", async () => {
  const { t, f, as, upload } = await setup();
  const unfinished = await upload(f.aliceId, { targetUserId: "bob", communityId: f.communityId }, { finish: false });
  await expect(as("alice").mutation(dm.sendDirectMessageToUser, {
    targetUserId: "bob", communityId: f.communityId, text: "look", attachments: [{ attachment_id: unfinished.attachmentId }],
  })).rejects.toThrow("dm_attachment_unavailable");
  // Storage holds a different type than the reservation says.
  await expect(upload(f.aliceId, { targetUserId: "bob", communityId: f.communityId }, { contentType: "text/html" })).rejects.toThrow("dm_attachment_metadata_invalid");
  // A cancelled reservation is gone, with its bytes.
  await t.mutation(refs.cleanupInternal, { attachmentId: unfinished.attachmentId, cancelOwnerId: f.aliceId });
  const rows = await t.run(ctx => ctx.db.query("dmAttachments").collect());
  expect(rows.some(row => String(row._id) === unfinished.attachmentId && row.status === "pending")).toBe(false);
});

test("you can only upload for someone you may message, and never for a conversation you are not in", async () => {
  const { t, f, as, upload } = await setup();
  // No community in common.
  await expect(upload(f.carolId, { targetUserId: "alice" })).rejects.toThrow("dm_conversation_access_required");
  await expect(upload(f.aliceId, { targetUserId: "alice" })).rejects.toThrow("dm_conversation_access_required");
  const first = await as("alice").mutation(dm.sendDirectMessageToUser, { targetUserId: "bob", communityId: f.communityId, text: "hi" });
  // Dave is not in Alice and Bob's conversation.
  await expect(upload(f.daveId, { conversationId: first.conversation.id })).rejects.toThrow();
  // In the conversation: allowed, and the file goes in an ordinary reply.
  const reply = await upload(f.bobId, { conversationId: first.conversation.id });
  const convoId = await t.run(ctx => ctx.db.query("dmConversations").first().then(row => row!._id));
  const sent = await as("bob").mutation(dm.sendDirectMessage, { conversationId: convoId, text: "here", attachments: [{ attachment_id: reply.attachmentId }] });
  expect(sent.content_json.attachments).toHaveLength(1);
  // After a block, no more uploads either way.
  await as("bob").mutation(dm.blockDirectMessageUser, { targetUserId: "alice" });
  await expect(upload(f.aliceId, { conversationId: first.conversation.id })).rejects.toThrow("dm_conversation_access_required");
});
