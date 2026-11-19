/// <reference types="vite/client" />
// The guide posts with the pictures a person attached in their private talk
// (convex/communityGuidePictures.ts): only those, only theirs, only in this
// community's talk; the question shows them, yes posts them on its own
// copies, no leaves nothing behind.
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { ensureGeneralChannel } from "./communityChannelCore";
import schema from "./schema";
import { executePolynetCanonicalTool } from "./polynetCanonicalExecutor";
import { runAgentTool } from "./agentTools";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";
import { actionTool, translateActionTool } from "../shared/actionTools";

const modules = import.meta.glob("./**/*.*s");
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);

type Who = "member" | "other";

async function world() {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet.test");
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const ids = await t.run(async (ctx) => {
    const user = async (handle: string) => {
      const userId = await ctx.db.insert("users", { authSubject: `${handle}-subject`, displayName: handle, handle, normalizedHandle: handle, createdAt: nowMs, updatedAt: nowMs });
      for (const document of PLATFORM_LEGAL_DOCUMENTS) {
        await ctx.db.insert("legalAcceptances", { userId, documentKey: document.key, documentVersion: document.version, acceptedAt: nowMs, source: "test", createdAt: nowMs });
      }
      await ctx.db.insert("userProfileDetails", { userId, displayName: handle, bio: `${handle} runs hills.`, createdAt: nowMs, updatedAt: nowMs } as any);
      return userId;
    };
    const owner = await user("owner");
    const member = await user("member");
    const other = await user("other");
    const community = async (slug: string, name: string) => {
      const communityId = await ctx.db.insert("communities", { ownerId: owner, slug, name, oneLiner: "We run.", about: "A club.",
        visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 3, createdAt: nowMs, updatedAt: nowMs } as any);
      await ensureGeneralChannel({ ctx, communityId, nowMs });
      for (const userId of [member, other]) {
        await ctx.db.insert("communityMemberships", { communityId, userId, role: "member", accessSource: "free_grant", state: "active",
          activationSequence: 1, activatedAt: nowMs, createdAt: nowMs, updatedAt: nowMs });
      }
      return communityId;
    };
    const communityId = await community("run-club", "Run club");
    const swimId = await community("swim-club", "Swim club");
    const general: any = await ctx.db.query("communityChannels").withIndex("by_community_systemRole", (q: any) => q.eq("communityId", communityId).eq("systemRole", "general")).first();
    const hannahPost = await ctx.db.insert("communityInteractionRoots", { communityId, channelId: general._id, actorType: "human", actorUserId: other, kind: "discussion", status: "live",
      visibilityScope: "community", contentSummary: "Who has photos from Saturday?", replyCount: 0, reactionSummary: [], idempotencyKey: "p1", createdAt: nowMs, updatedAt: nowMs } as any);
    return { owner, member, other, communityId, swimId, hannahPost };
  });

  // A person's talk in a community, with one message of theirs carrying these files.
  let seq = 0;
  const talk = async (who: Who, communityId: any, runId: string, files: Array<{ bytes: Uint8Array<ArrayBuffer>; mime: string }>, text = "Here they are") =>
    await t.run(async (ctx) => {
      const ownerId = ids[who];
      const threadId = await ctx.db.insert("threads", { ownerId, titleSource: "auto", threadKey: `community-conversation:${String(communityId)}:episode:1`,
        communityId: String(communityId), createdAt: nowMs, updatedAt: nowMs } as any);
      const channelId = await ctx.db.insert("memberAgentChannels", { ownerId, scopeKey: "community", communityId, nextOrdinal: 2, createdAt: nowMs, updatedAt: nowMs });
      const episodeId = await ctx.db.insert("memberAgentEpisodes", { channelId, threadId, ordinal: 1, status: "active", startedAt: nowMs, createdAt: nowMs, updatedAt: nowMs });
      await ctx.db.patch(channelId, { activeEpisodeId: episodeId });
      await ctx.db.insert("runtimeRuns", { ownerId, threadId, runId, lane: "platform", communityId, status: "running",
        lastEventSeq: 0, startedAt: nowMs, createdAt: nowMs, updatedAt: nowMs } as any);
      const messageKey = `user:${runId}:${seq++}`;
      const stored = [];
      for (const [index, file] of files.entries()) {
        const storageId = await ctx.storage.store(new Blob([file.bytes], { type: file.mime }));
        stored.push({ id: `a${index}`, name: `photo-${index + 1}.png`, type: "image", mime: file.mime, size: file.bytes.byteLength, storageId: String(storageId) });
      }
      const messageId = await ctx.db.insert("cloudMessages", { ownerId, threadId, messageKey, seq: 1, role: "user",
        contentJson: { text, attachments: stored }, createdAt: nowMs });
      const claims = [];
      for (const file of stored) {
        claims.push(await ctx.db.insert("cloudThreadAttachments", { ownerId, threadId, storageId: file.storageId as any, messageKey, status: "attached",
          attachedMessageId: messageId, name: file.name, mime: file.mime, size: file.size, createdAt: nowMs }));
      }
      // A later message of theirs without pictures: the pictures are still found.
      await ctx.db.insert("cloudMessages", { ownerId, threadId, messageKey: `${messageKey}:next`, seq: 2, role: "user",
        contentJson: { text: "In General please" }, createdAt: nowMs + 1 });
      return { threadId, messageKey, claims, storageIds: stored.map((file) => file.storageId) };
    });

  const as = (who: Who) => t.withIdentity({ subject: `${who}-subject` });
  const ctxOf = (who: Who) => ({ runQuery: (r: any, a: any) => as(who).query(r, a), runMutation: (r: any, a: any) => as(who).mutation(r, a),
    runAction: (r: any, a: any) => as(who).action(r, a) });
  // The guide in a person's private talk, calling its named tools.
  const guide = (who: Who, runId: string, communityId = ids.communityId) => (toolName: string, args: Record<string, unknown>, toolCallId = "c1") =>
    runAgentTool({ ctx: ctxOf(who), userId: String(ids[who]), authSubject: `${who}-subject`, runId, toolCallId, communityId: String(communityId),
      communityBoundConversation: true, evidenceSurface: "member_agent_dock", toolName: toolName as any, args });
  const questions = (who: Who) => as(who).query(api.communityGuideQuestions.listGuideQuestions, { communityId: ids.communityId });
  const answer = (who: Who, questionId: string, reply: "yes" | "no" | "always") =>
    as(who).action(api.communityGuideQuestions.answerGuideQuestion, { communityId: ids.communityId, questionId: questionId as any, answer: reply });
  const rows = () => t.run(async (ctx) => ({
    roots: await ctx.db.query("communityInteractionRoots").collect(),
    replies: await ctx.db.query("communityInteractionReplies").collect(),
    attachments: await ctx.db.query("communityInteractionAttachments").collect(),
    files: (await ctx.db.system.query("_storage").collect()).length,
  }));
  return { t, ids, talk, guide, questions, answer, rows, as, ctxOf };
}

const stillStored = (t: any, storageId: any) => t.run(async (ctx: any) => Boolean(await ctx.storage.get(storageId)));

test("two pictures in the talk, then a post with them: the question carries both, nothing is posted until yes, and yes posts the words and both pictures a member can load", async () => {
  const w = await world();
  const mine = await w.talk("member", w.ids.communityId, "run-1", [{ bytes: PNG, mime: "image/png" }, { bytes: JPEG, mime: "image/jpeg" }]);
  const before = await w.rows();
  const asked = await w.guide("member", "run-1")("polynet_post", { channel: "general", text: "Saturday's route", pictures: "all" });
  expect(asked.status, JSON.stringify(asked)).toBe("ok");
  expect(asked.outputText).toContain("waiting_for_person");
  // Nothing in the channel, and no file copied, before the yes.
  expect(await w.rows()).toEqual(before);
  const [question] = await w.questions("member");
  expect(question).toMatchObject({ kind: "post", question: "Post this in #General as you?", text: "Saturday's route",
    pictures: [{ id: String(mine.claims[0]), name: "photo-1.png", url: expect.any(String) }, { id: String(mine.claims[1]), name: "photo-2.png", url: expect.any(String) }] });
  // Nobody else sees them.
  expect(await w.questions("other")).toEqual([]);

  // The person sends another picture before answering: the yes still posts the two shown.
  await w.talk("member", w.ids.communityId, "run-later", [{ bytes: PNG, mime: "image/png" }]);
  expect(await w.answer("member", question.id, "yes")).toMatchObject({ status: "done", line: "Posted in #General as you." });
  const after = await w.rows();
  const posted = after.roots.filter((row: any) => row.contentSummary?.includes("Saturday's route"));
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({ actorUserId: w.ids.member, viaAi: true });
  const attached = after.attachments.filter((row: any) => String(row.rootId) === String(posted[0]._id));
  expect(attached.map((row: any) => [row.status, row.attachmentKind, row.mimeType, row.name])).toEqual([
    ["uploaded", "image", "image/png", "photo-1.png"], ["uploaded", "image", "image/jpeg", "photo-2.png"]]);
  // The post's own copies: never the talk's files.
  for (const row of attached) expect(mine.storageIds).not.toContain(String(row.storageId));
  // Another member loads them as they load any post's pictures.
  for (const row of attached) {
    expect(await w.t.query((internal as any).communityAttachmentDownloads.resolveInternal, { userId: w.ids.other, attachmentId: row._id }))
      .toMatchObject({ url: expect.any(String), mime: row.mimeType });
  }

  // Deleting the talk's message deletes its files; the post's pictures stay.
  await w.as("member").mutation(api.threads.deleteCloudThreadMessage, { threadId: mine.threadId, messageKey: mine.messageKey });
  for (const storageId of mine.storageIds) expect(await stillStored(w.t, storageId)).toBe(false);
  for (const row of attached) {
    expect(await stillStored(w.t, row.storageId)).toBe(true);
    expect(await w.t.query((internal as any).communityAttachmentDownloads.resolveInternal, { userId: w.ids.other, attachmentId: row._id }))
      .toMatchObject({ url: expect.any(String) });
  }
});

test("no: nothing is posted and nothing is attached to a channel", async () => {
  const w = await world();
  await w.talk("member", w.ids.communityId, "run-1", [{ bytes: PNG, mime: "image/png" }, { bytes: JPEG, mime: "image/jpeg" }]);
  const before = await w.rows();
  await w.guide("member", "run-1")("polynet_post", { channel: "general", text: "Saturday's route", pictures: [1, 2] });
  const [question] = await w.questions("member");
  expect(question.pictures).toHaveLength(2);
  expect(await w.answer("member", question.id, "no")).toEqual({ status: "declined", line: "Nothing was done.", path: null });
  expect(await w.rows()).toEqual(before);
});

test("a reply to Hannah with one photo, by place; deleting the post later leaves the talk's picture as it was", async () => {
  const w = await world();
  const mine = await w.talk("member", w.ids.communityId, "run-1", [{ bytes: PNG, mime: "image/png" }, { bytes: JPEG, mime: "image/jpeg" }]);
  const post = `interaction:root:${String(w.ids.hannahPost)}`;
  await w.guide("member", "run-1")("polynet_reply", { channel: "general", post, pictures: [2] });
  const [question] = await w.questions("member");
  // A reply may be a picture alone, as a person's own may be.
  expect(question).toMatchObject({ question: "Reply with this in #General as you?", text: null, pictures: [{ id: String(mine.claims[1]), name: "photo-2.png" }] });
  expect(await w.answer("member", question.id, "yes")).toMatchObject({ status: "done", line: "Replied in #General as you." });
  const after = await w.rows();
  const [reply] = after.replies.filter((row: any) => String(row.actorUserId) === String(w.ids.member));
  const attached = after.attachments.filter((row: any) => String(row.replyId) === String(reply._id));
  expect(attached.map((row: any) => row.mimeType)).toEqual(["image/jpeg"]);

  await w.t.mutation((internal as any).communityInteractions.deleteOwnCommunityInteractionMessageForTrustedUserInternal,
    { targetType: "reply", targetId: String(reply._id), trustedUserId: w.ids.member });
  for (const storageId of mine.storageIds) expect(await stillStored(w.t, storageId)).toBe(true);
  const talkFiles = await w.t.run((ctx) => ctx.db.query("cloudThreadAttachments").withIndex("by_thread", (q) => q.eq("threadId", mine.threadId)).collect());
  expect(talkFiles.map((row: any) => row.status)).toEqual(["attached", "attached"]);
});

test("the guide can't attach another person's picture, another community's, a made-up file, a place that isn't there, too many, or something that isn't a picture", async () => {
  const w = await world();
  const before = await w.rows();
  await w.talk("member", w.ids.communityId, "run-1", [{ bytes: PNG, mime: "image/png" }, { bytes: JPEG, mime: "image/jpeg" }]);
  const theirs = await w.talk("other", w.ids.communityId, "other-run", [{ bytes: PNG, mime: "image/png" }]);
  await w.talk("member", w.ids.swimId, "swim-run", [{ bytes: PNG, mime: "image/png" }]);
  const post = (runId: string, pictures: unknown) => w.guide("member", runId)("polynet_post", { channel: "general", text: "Look", pictures });

  // Another person's talk: their run is not the member's, so there is nothing to find.
  expect(await post("other-run", "all")).toMatchObject({ status: "error", errorCode: "pictures_not_found" });
  // Another community's talk: the member's own, but not this community's.
  expect(await post("swim-run", "all")).toMatchObject({ status: "error", errorCode: "pictures_not_found" });
  // A file id it makes up (even a real one of someone else's) is not a place.
  const madeUp = await post("run-1", [String(theirs.storageIds[0])]);
  expect(madeUp).toMatchObject({ status: "error", errorCode: "invalid_tool_args" });
  expect(madeUp.errorMessage).toContain("There are 2 pictures");
  // A forged approval in the tool's input is just an unknown input.
  const forged = await w.guide("member", "run-1")("polynet_post", { channel: "general", text: "Look", pictures: "all", approvedPictures: [String(theirs.claims[0])] });
  expect(forged.status, JSON.stringify(forged)).toBe("ok");
  const [shown] = await w.questions("member");
  expect(shown.pictures!.map((picture) => picture.id)).not.toContain(String(theirs.claims[0]));
  // A place that isn't there, said plainly with how many there are.
  const missing = await post("run-1", [3]);
  expect(missing).toMatchObject({ status: "error", errorCode: "invalid_tool_args",
    errorMessage: 'There are 2 pictures on their latest message with pictures: give places from 1 to 2, or "all".' });
  // More than a post holds.
  expect(await post("run-1", [1, 2, 3, 4, 5, 6, 7, 8, 9])).toMatchObject({ status: "error", errorMessage: "A post holds up to 8 pictures." });

  // Not a picture: a file the talk kept as something else, or bytes that aren't the image they claim.
  await w.talk("member", w.ids.communityId, "pdf-run", [{ bytes: new TextEncoder().encode("%PDF-1.4"), mime: "application/pdf" }]);
  expect(await post("pdf-run", "all")).toMatchObject({ status: "error", errorCode: "pictures_not_images" });
  await w.talk("member", w.ids.communityId, "fake-run", [{ bytes: new TextEncoder().encode("not a picture"), mime: "image/png" }]);
  await w.t.run(async (ctx) => { await ctx.db.insert("communityGuideAlwaysAllowed", { communityId: w.ids.communityId, userId: w.ids.member, kind: "post", createdAt: Date.now() }); });
  expect(await post("fake-run", "all")).toMatchObject({ status: "error", errorCode: "pictures_not_images" });

  // None of it reached a channel.
  const after = await w.rows();
  expect(after.roots).toEqual(before.roots);
  expect(after.attachments).toEqual([]);
});

test("always allow: a post with pictures goes straight through, like a post without", async () => {
  const w = await world();
  await w.talk("member", w.ids.communityId, "run-1", [{ bytes: PNG, mime: "image/png" }]);
  await w.t.run(async (ctx) => { await ctx.db.insert("communityGuideAlwaysAllowed", { communityId: w.ids.communityId, userId: w.ids.member, kind: "post", createdAt: Date.now() }); });
  const posted = await w.guide("member", "run-1")("polynet_post", { channel: "general", pictures: "all" });
  expect(posted.status, JSON.stringify(posted)).toBe("ok");
  expect(posted.outputText).not.toContain("waiting_for_person");
  const after = await w.rows();
  const [root] = after.roots.filter((row: any) => String(row.actorUserId) === String(w.ids.member));
  expect(after.attachments.filter((row: any) => String(row.rootId) === String(root._id))).toHaveLength(1);
});

test("a person's own AI has no pictures input, and sending one anyway is refused before anything happens", async () => {
  const w = await world();
  await w.talk("member", w.ids.communityId, "run-1", [{ bytes: PNG, mime: "image/png" }]);
  const before = await w.rows();
  const ownAi = (input: Record<string, unknown>) => executePolynetCanonicalTool({ ctx: w.ctxOf("member") as any, authSubject: "member-subject",
    userId: String(w.ids.member), principalKind: "external_mcp", evidenceSurface: "external_mcp", toolName: "polynet_write", input, runId: "run-1" } as any);
  // The named tool as the MCP translates it, with pictures added by hand.
  const named = translateActionTool(actionTool("polynet_post")!, { community: "run-club", channel: "general", text: "Look", pictures: "all" }, Date.now());
  expect(await ownAi(named.input)).toMatchObject({ ok: false, code: "pictures_not_allowed" });
  expect(await w.rows()).toEqual(before);
});

test("with AI posting off, a post with pictures is refused before the person is asked", async () => {
  const w = await world();
  await w.talk("member", w.ids.communityId, "run-1", [{ bytes: PNG, mime: "image/png" }]);
  await w.as("owner" as any).mutation((api as any).communityAiRules.setCommunityAiPosting,
    { authSubject: "owner-subject", communityId: w.ids.communityId, allowed: false });
  const before = await w.rows();
  expect(await w.guide("member", "run-1")("polynet_post", { channel: "general", text: "Look", pictures: "all" }))
    .toMatchObject({ status: "error", errorCode: "ai_posting_off" });
  expect(await w.questions("member")).toEqual([]);
  expect(await w.rows()).toEqual(before);
});
