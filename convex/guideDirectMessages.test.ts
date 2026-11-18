/// <reference types="vite/client" />
// The guide in a person's private talk reads their own direct messages and
// replies in one only after their yes, every time (shared/operationCatalog.ts,
// guideAskFor "message"). A host never reads a conversation between two
// other people, and the community's own agent never reads anyone's. What the
// night review and the briefs read holds no direct message.
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { ensureGeneralChannel } from "./communityChannelCore";
import schema from "./schema";
import { executePolynetCanonicalTool } from "./polynetCanonicalExecutor";
import { runAgentTool } from "./agentTools";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";

const modules = import.meta.glob("./**/*.*s");

type Who = "owner" | "member" | "other";
const SECRET = "MARKER-ONLY-IN-A-DIRECT-MESSAGE";

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
    const communityId = await ctx.db.insert("communities", { ownerId: owner, slug: "run-club", name: "Run club", oneLiner: "We run.", about: "A club for runners.",
      visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 3, createdAt: nowMs, updatedAt: nowMs } as any);
    await ensureGeneralChannel({ ctx, communityId, nowMs });
    for (const userId of [member, other]) {
      await ctx.db.insert("communityMemberships", { communityId, userId, role: "member", accessSource: "free_grant", state: "active",
        activationSequence: 1, activatedAt: nowMs, createdAt: nowMs, updatedAt: nowMs });
    }
    // A post in the open channel, so the review and the briefs have something to read.
    const general: any = await ctx.db.query("communityChannels").withIndex("by_community_systemRole", (q: any) => q.eq("communityId", communityId).eq("systemRole", "general")).first();
    await ctx.db.insert("communityInteractionRoots", { communityId, channelId: general._id, actorType: "human", actorUserId: other, kind: "discussion", status: "live",
      visibilityScope: "community", contentSummary: "Hill repeats on Thursday, who is in?", replyCount: 0, reactionSummary: [], idempotencyKey: "p1", createdAt: nowMs, updatedAt: nowMs } as any);
    for (const [userId, runId] of [[owner, "talk-owner"], [member, "talk-member"], [other, "talk-other"]] as const) {
      const threadId = await ctx.db.insert("threads", { ownerId: userId, titleSource: "auto", createdAt: nowMs, updatedAt: nowMs } as any);
      await ctx.db.insert("runtimeRuns", { ownerId: userId, threadId, runId, lane: "platform", communityId, status: "running",
        lastEventSeq: 0, startedAt: nowMs, createdAt: nowMs, updatedAt: nowMs } as any);
    }
    return { owner, member, other, communityId };
  });
  // Conversations, started in the app: the owner with the member, the member
  // with the other member (the host is in neither of those two), and the owner
  // with the other member.
  const send = async (from: Who, to: Who, text: string) => (await t.mutation((internal as any).directMessages.sendSiteDirectMessageForTrustedUserInternal,
    { userId: ids[from], communityId: ids.communityId, handle: to, text })).conversation_id as string;
  const ownerMember = await send("owner", "member", "Are you coming to the Sunday run?");
  const memberOther = await send("other", "member", `Between us: ${SECRET}`);
  const ownerOther = await send("owner", "other", "Thanks for leading Thursday.");
  const as = (who: Who) => t.withIdentity({ subject: `${who}-subject` });
  const ctxOf = (who: Who) => {
    const identity = as(who);
    return { runQuery: (r: any, a: any) => identity.query(r, a), runMutation: (r: any, a: any) => identity.mutation(r, a), runAction: (r: any, a: any) => identity.action(r, a) };
  };
  // The person's private talk with the guide, as the agent loop calls it.
  const talk = (who: Who, runId = `talk-${who}`) => (toolName: string, args: Record<string, unknown>, toolCallId = `${toolName}:${JSON.stringify(args)}`) =>
    runAgentTool({ ctx: ctxOf(who), userId: String(ids[who]), authSubject: `${who}-subject`, runId, toolCallId, communityId: String(ids.communityId),
      communityBoundConversation: true, evidenceSurface: "member_agent_dock", toolName: toolName as any, args });
  // The guide tagged in a channel: the community's own agent, run for its sponsor.
  const inPublic = (who: Who) => (toolName: string, args: Record<string, unknown>) =>
    runAgentTool({ ctx: ctxOf(who), userId: String(ids[who]), authSubject: `${who}-subject`, runId: "public-1", toolCallId: "c1", communityId: String(ids.communityId),
      communityBoundConversation: true, evidenceSurface: "community_concierge", toolName: toolName as any, args });
  const questions = (who: Who) => as(who).query(api.communityGuideQuestions.listGuideQuestions, { communityId: ids.communityId });
  const answer = (who: Who, questionId: string, reply: "yes" | "no" | "always") => as(who)
    .action(api.communityGuideQuestions.answerGuideQuestion, { communityId: ids.communityId, questionId: questionId as any, answer: reply });
  const messages = () => t.run((ctx) => ctx.db.query("dmMessages").collect());
  const allQuestions = () => t.run((ctx) => ctx.db.query("communityGuideQuestions").collect());
  return { t, ids, ownerMember, memberOther, ownerOther, as, ctxOf, talk, inPublic, questions, answer, messages, allQuestions };
}

const listed = (result: any) => JSON.parse(result.outputText);

test("the guide lists the person's own conversations and reads one, and is told what it reads stays in the talk", async () => {
  const w = await world();
  const inbox = await w.talk("member")("polynet_list", { path: "/messages/" });
  expect(inbox.status, JSON.stringify(inbox)).toBe("ok");
  expect(listed(inbox).entries.map((entry: any) => entry.path).sort()).toEqual([`/messages/${w.ownerMember}/`, `/messages/${w.memberOther}/`].sort());
  expect(listed(inbox).guidance).toContain("a reply waits for their yes, every time");
  expect(listed(inbox).guidance).toContain("private to this talk");
  const read = await w.talk("member")("polynet_list", { path: `/messages/${w.ownerMember}/` });
  expect(listed(read).entries).toMatchObject([{ from_me: false, text: "Are you coming to the Sunday run?" }]);
});

test("a reply through the guide is never sent without a yes, is asked every time, and always-allow for posts does not cover it", async () => {
  const w = await world();
  // The member has said posts may go out without asking.
  await w.as("member").mutation(api.communityGuideQuestions.setGuideAlwaysAllowed, { communityId: w.ids.communityId, kind: "post", on: true });
  const before = await w.messages();
  const asked = await w.talk("member")("polynet_reply_message", { conversation: w.ownerMember, text: "Yes, see you at 7." }, "call_1");
  expect(asked.status, JSON.stringify(asked)).toBe("ok");
  expect(listed(asked)).toMatchObject({ status: "waiting_for_person", question: "Send this to owner as you?" });
  expect(await w.messages()).toEqual(before);
  const [question] = await w.questions("member");
  expect(question).toEqual({ id: expect.any(String), kind: "message", question: "Send this to owner as you?", text: "Yes, see you at 7.", items: [], canAlways: false });
  // Nobody else sees it, the owner included.
  expect(await w.questions("owner")).toEqual([]);

  // "Always" is never kept for a message: it sends this one.
  expect(await w.answer("member", question.id, "always")).toEqual({ status: "done", line: "Sent to owner as you.",
    path: `/c/run-club/inbox/${encodeURIComponent(w.ownerMember)}` });
  const after = await w.messages();
  const sent = after.filter((row: any) => !before.some((old: any) => String(old._id) === String(row._id)));
  expect(sent).toEqual([expect.objectContaining({ senderUserId: w.ids.member, viaAi: true })]);
  expect((await w.t.run((ctx) => ctx.db.query("communityGuideAlwaysAllowed").collect())).map((row: any) => row.kind)).toEqual(["post"]);
  // The same answer again sends nothing twice.
  await w.answer("member", question.id, "yes");
  expect(await w.messages()).toHaveLength(after.length);

  // The next reply is asked again; no sends nothing.
  await w.talk("member", "talk-member")("polynet_reply_message", { conversation: w.ownerMember, text: "Running late." }, "call_2");
  const [next] = await w.questions("member");
  expect(next).toMatchObject({ kind: "message", text: "Running late." });
  expect(await w.answer("member", next.id, "no")).toMatchObject({ status: "declined" });
  expect(await w.messages()).toHaveLength(after.length);

  // Calling the executor as the guide directly, without a yes, never sends either.
  const direct = await executePolynetCanonicalTool({ ctx: w.ctxOf("member"), authSubject: "member-subject", userId: String(w.ids.member),
    principalKind: "community_agent_for_member", mountedCommunityId: String(w.ids.communityId), evidenceSurface: "member_agent_dock",
    toolName: "polynet_write", input: { path: `/messages/${w.ownerMember}/`, mode: "append", content: { text: "Straight in?" }, idempotency_key: "k1" } });
  expect(direct).toMatchObject({ ok: true, value: { status: "waiting_for_person" } });
  expect(await w.messages()).toHaveLength(after.length);
});

test("a reply that would be refused is refused before asking; one refused after the question fails with the plain reason", async () => {
  const w = await world();
  const before = await w.messages();
  // The member asks, then the other person blocks them before the yes.
  await w.talk("member")("polynet_reply_message", { conversation: w.memberOther, text: "Sounds good." }, "call_1");
  const [question] = await w.questions("member");
  await w.as("other").mutation((api as any).directMessages.blockDirectMessageUser, { authSubject: "other-subject", targetUserId: "member-subject" });
  expect(await w.answer("member", question.id, "yes")).toEqual({ status: "failed", line: "You can't message this person.", path: null });
  expect((await w.allQuestions()).find((row: any) => String(row._id) === question.id)).toMatchObject({ status: "failed" });
  expect(await w.messages()).toEqual(before);
  // Asked again now, it is refused at once, with no question.
  const count = (await w.allQuestions()).length;
  expect(await w.talk("member", "talk-member")("polynet_reply_message", { conversation: w.memberOther, text: "Hello?" }, "call_2"))
    .toMatchObject({ status: "error", errorCode: "message_not_allowed" });
  // Words an AI may not send are refused at once too.
  expect(await w.talk("member", "talk-member")("polynet_reply_message", { conversation: w.ownerMember, text: "x".repeat(1_600) }, "call_3"))
    .toMatchObject({ status: "error", errorCode: "ai_post_too_long" });
  expect(await w.allQuestions()).toHaveLength(count);
});

test("a host's guide sees only the host's own conversations: one between two members is not found, on list and on reply", async () => {
  const w = await world();
  const owner = w.talk("owner");
  const inbox = await owner("polynet_list", { path: "/messages/" });
  expect(listed(inbox).entries.map((entry: any) => entry.path).sort()).toEqual([`/messages/${w.ownerMember}/`, `/messages/${w.ownerOther}/`].sort());
  expect(inbox.outputText).not.toContain(SECRET);
  const between = await owner("polynet_list", { path: `/messages/${w.memberOther}/` });
  expect(between).toMatchObject({ status: "error", errorCode: "semantic_not_found" });
  expect(JSON.stringify(between)).not.toContain(SECRET);
  expect(await owner("polynet_reply_message", { conversation: w.memberOther, text: "I'm the host." }))
    .toMatchObject({ status: "error", errorCode: "semantic_not_found" });
  // Through the owner's own AI as well.
  const ownAi = (input: Record<string, unknown>, toolName: "polynet_list" | "polynet_write") => executePolynetCanonicalTool({ ctx: w.ctxOf("owner"),
    authSubject: "owner-subject", userId: String(w.ids.owner), principalKind: "external_mcp", evidenceSurface: "external_mcp", toolName, input });
  expect(await ownAi({ path: `/messages/${w.memberOther}/` }, "polynet_list")).toMatchObject({ ok: false, code: "semantic_not_found" });
  expect(await ownAi({ path: `/messages/${w.memberOther}/`, mode: "append", content: { text: "I'm the host." }, idempotency_key: "h1" }, "polynet_write"))
    .toMatchObject({ ok: false, code: "semantic_not_found" });
  expect(await w.allQuestions()).toEqual([]);
  expect((await w.messages()).filter((row: any) => String(row.conversationId) === w.memberOther && String(row.senderUserId) === String(w.ids.owner))).toEqual([]);
});

test("the community's own agent never reaches anyone's direct messages", async () => {
  const w = await world();
  // Tagged in a channel, run for its sponsor (the owner here).
  for (const path of ["/messages/", `/messages/${w.ownerMember}/`]) {
    const result = await w.inPublic("owner")("polynet_list", { path });
    expect(result.status, path).toBe("error");
    expect(JSON.stringify(result)).not.toContain("Sunday run");
  }
  for (const [toolName, input] of [["polynet_list", { path: "/messages/" }], ["polynet_list", { path: `/messages/${w.ownerMember}/` }],
    ["polynet_write", { path: `/messages/${w.ownerMember}/`, mode: "append", content: { text: "From the community." }, idempotency_key: "a1" }]] as const) {
    const direct = await executePolynetCanonicalTool({ ctx: w.ctxOf("owner"), authSubject: "owner-subject", userId: String(w.ids.owner),
      principalKind: "community_agent", mountedCommunityId: String(w.ids.communityId), evidenceSurface: "community_concierge", toolName, input: input as any });
    expect(direct, `${toolName} ${input.path}`).toMatchObject({ ok: false, code: "semantic_not_found" });
  }
  // The guide outside a private talk (no community, or not the dock) is refused too.
  expect(await executePolynetCanonicalTool({ ctx: w.ctxOf("owner"), authSubject: "owner-subject", userId: String(w.ids.owner),
    principalKind: "community_agent_for_member", evidenceSurface: "member_agent_dock", toolName: "polynet_list", input: { path: "/messages/" } }))
    .toMatchObject({ ok: false, code: "semantic_not_found" });
  expect((await w.messages()).filter((row: any) => row.viaAi)).toEqual([]);
  expect(await w.allQuestions()).toEqual([]);
});

test("the night review, the community's brief and the host's brief read no direct message", async () => {
  const w = await world();
  const nowMs = Date.now();
  const review: any = await w.t.query(internal.communityMemory.readMemoryReviewInputInternal, { communityId: w.ids.communityId, sinceMs: nowMs - 86_400_000, untilMs: nowMs + 60_000 });
  const brief: any = await w.t.query(internal.communityBriefs.readCommunityBriefInputInternal, { communityId: w.ids.communityId, untilMs: nowMs + 60_000 });
  const founder: any = await w.t.query((internal as any).communityFounderBrief.readFounderBriefSnapshotInternal,
    { communityId: w.ids.communityId, windowStartMs: nowMs - 86_400_000, nowMs: nowMs + 60_000 });
  // Each read the channel's post, so each was looking.
  expect(JSON.stringify(review)).toContain("Hill repeats on Thursday");
  expect(JSON.stringify(brief)).toContain("Hill repeats on Thursday");
  expect(founder).not.toBeNull();
  for (const [name, input] of [["review", review], ["brief", brief], ["founder brief", founder]] as const) {
    const text = JSON.stringify(input);
    expect(text, name).not.toContain(SECRET);
    expect(text, name).not.toContain("Are you coming to the Sunday run?");
  }
});

test("what a host reads about a member (their record, timeline, the builder records, a search) holds no direct message", async () => {
  const w = await world();
  const reads: string[] = [];
  for (const door of ["external_mcp", "community_agent_for_member"] as const) {
    const run = (toolName: "polynet_list" | "polynet_read" | "polynet_search", input: Record<string, unknown>) => executePolynetCanonicalTool({ ctx: w.ctxOf("owner"),
      authSubject: "owner-subject", userId: String(w.ids.owner), principalKind: door, mountedCommunityId: door === "external_mcp" ? undefined : String(w.ids.communityId),
      evidenceSurface: door === "external_mcp" ? "external_mcp" : "member_agent_dock", toolName, input } as any);
    for (const [toolName, input] of [
      ["polynet_read", { path: "/communities/run-club/members/member.json" }],
      ["polynet_read", { path: "/communities/run-club/members/member/timeline.md" }],
      ["polynet_read", { path: "/communities/run-club/members/other/timeline.md" }],
      ["polynet_list", { path: "/communities/run-club/members/" }],
      ["polynet_list", { path: "/communities/run-club/builder/" }],
      ["polynet_read", { path: "/communities/run-club/builder/community.json" }],
      ["polynet_search", { path: "/communities/run-club/", query: SECRET }],
    ] as const) {
      const result = await run(toolName, input);
      reads.push(JSON.stringify(result));
      expect(JSON.stringify(result), `${door} ${toolName} ${input.path}`).not.toContain(SECRET);
    }
  }
  // The record and the timeline were really read.
  expect(reads.some((text) => text.includes("member runs hills."))).toBe(true);
});

// The guide's loop checks a tool's arguments before the router sees them
// (shared/toolRegistry.ts). Found on staging: it refused /messages/ there, so
// none of the above was reachable from a real talk.
import { normalizeToolArguments } from "../shared/toolRegistry";
test("the guide's loop lets the person's messages path through to the executor", () => {
  expect(normalizeToolArguments("polynet_list" as any, { path: "/messages/", limit: 50, sort: "newest", cursor: null })).toMatchObject({ path: "/messages/" });
  expect(normalizeToolArguments("polynet_list" as any, { path: "/messages/abcd1234/" })).toMatchObject({ path: "/messages/abcd1234/" });
  expect(() => normalizeToolArguments("polynet_list" as any, { path: "/nowhere/" })).toThrow();
});

test("someone who has left the community can no longer list messages in its talk, or answer yes to a reply asked earlier", async () => {
  const w = await world();
  await w.talk("member")("polynet_reply_message", { conversation: w.ownerMember, text: "See you there." }, "call_1");
  const [question] = await w.questions("member");
  const before = await w.messages();
  // The member is removed from the community; their conversation with the owner still exists.
  await w.t.run(async (ctx) => {
    for (const row of await ctx.db.query("communityMemberships").collect()) {
      if (String(row.userId) === String(w.ids.member)) await ctx.db.patch(row._id, { state: "removed" } as any);
    }
  });
  const inbox = await w.talk("member")("polynet_list", { path: "/messages/" });
  expect(inbox.status).toBe("error");
  const answered = await w.answer("member", question.id, "yes").catch((error: any) => ({ status: "threw", line: String(error?.message ?? error) }));
  expect(answered.status).not.toBe("done");
  expect(await w.messages()).toHaveLength(before.length);
});
