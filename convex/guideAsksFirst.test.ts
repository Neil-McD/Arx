/// <reference types="vite/client" />
// The guide in a person's private talk does what their own AI does, and asks
// first when words go out under their name or something can't be taken back
// (shared/operationCatalog.ts, guideAskFor; convex/communityGuideQuestions.ts).
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { ensureGeneralChannel } from "./communityChannelCore";
import schema from "./schema";
import { executePolynetCanonicalTool } from "./polynetCanonicalExecutor";
import { runAgentTool } from "./agentTools";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";
import { actionTool, guideActionKey, translateActionTool } from "../shared/actionTools";

const modules = import.meta.glob("./**/*.*s");

type Who = "owner" | "member" | "other";

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
    const general: any = await ctx.db.query("communityChannels").withIndex("by_community_systemRole", (q: any) => q.eq("communityId", communityId).eq("systemRole", "general")).first();
    const otherPost = await ctx.db.insert("communityInteractionRoots", { communityId, channelId: general._id, actorType: "human", actorUserId: other, kind: "discussion", status: "live",
      visibilityScope: "community", contentSummary: "Who is in for Saturday?", replyCount: 0, reactionSummary: [], idempotencyKey: "p1", createdAt: nowMs, updatedAt: nowMs } as any);
    const memberPost = await ctx.db.insert("communityInteractionRoots", { communityId, channelId: general._id, actorType: "human", actorUserId: member, kind: "discussion", status: "live",
      visibilityScope: "community", contentSummary: "Cheap shoes, click here", replyCount: 0, reactionSummary: [], idempotencyKey: "p2", createdAt: nowMs + 1, updatedAt: nowMs + 1 } as any);
    const course = await ctx.db.insert("communityResourceModules", { communityId, createdByUserId: owner, status: "live", name: "Start here", sortOrder: 1, createdAt: nowMs, updatedAt: nowMs });
    const lesson = await ctx.db.insert("communityResources", { communityId, createdByUserId: owner, moduleId: course, type: "post", role: "page", status: "draft",
      title: "Your first week", bodyMd: "Run three times, easy.", pinned: false, sortOrder: 1, createdAt: nowMs, updatedAt: nowMs });
    return { owner, member, other, communityId, otherPost, memberPost, lesson };
  });
  const subject = (who: Who) => `${who}-subject`;
  const door = (who: Who, principalKind: "external_mcp" | "community_agent_for_member", runId?: string) => (toolName: any, input: Record<string, unknown>) => {
    const as = t.withIdentity({ subject: subject(who) });
    return executePolynetCanonicalTool({
      ctx: { runQuery: (r: any, a: any) => as.query(r, a), runMutation: (r: any, a: any) => as.mutation(r, a), runAction: (r: any, a: any) => as.action(r, a) } as any,
      authSubject: subject(who), userId: String(ids[who]), principalKind, ...(runId ? { runId } : {}),
      evidenceSurface: principalKind === "external_mcp" ? "external_mcp" : "member_agent_dock", toolName, input,
    } as any);
  };
  const guide = (who: Who, runId = "run-1") => door(who, "community_agent_for_member", runId);
  const questions = (who: Who) => t.withIdentity({ subject: subject(who) }).query(api.communityGuideQuestions.listGuideQuestions, { communityId: ids.communityId });
  const answer = (who: Who, questionId: string, reply: "yes" | "no" | "always") => t.withIdentity({ subject: subject(who) })
    .action(api.communityGuideQuestions.answerGuideQuestion, { communityId: ids.communityId, questionId: questionId as any, answer: reply });
  const rows = () => t.run(async (ctx) => ({
    roots: await ctx.db.query("communityInteractionRoots").collect(),
    replies: await ctx.db.query("communityInteractionReplies").collect(),
    receipts: await ctx.db.query("polynetCanonicalOperationReceipts").collect(),
    questions: await ctx.db.query("communityGuideQuestions").collect(),
    always: await ctx.db.query("communityGuideAlwaysAllowed").collect(),
  }));
  return { t, ids, door, guide, questions, answer, rows };
}

const ROOT = "/communities/run-club/";
const GENERAL = `${ROOT}channels/general/`;
const post = (text: string, key: string) => ({ path: GENERAL, mode: "create", content: { text }, idempotency_key: key });
const removal = (refs: string[], key = "remove-1") => ({ operation: "community.interaction.remove", version: 1,
  target: `${ROOT}capabilities/community.interaction.remove.json`, input: { refs }, idempotency_key: key });
const rootsBy = (roots: any[], userId: unknown) => roots.filter((row) => String(row.actorUserId) === String(userId));

test("a member's post through the guide waits for their yes, then goes out under their name once", async () => {
  const w = await world();
  const words = "Saturday at 7, the boathouse. Who is in?";
  const before = await w.rows();
  const asked = await w.guide("member")("polynet_write", post(words, "post-1"));
  expect(asked).toEqual({ ok: true, value: { ok: true, status: "waiting_for_person", question: "Post this in #General as you?", note: expect.any(String) } });
  const waiting = await w.rows();
  expect(waiting.roots).toEqual(before.roots);
  expect(waiting.receipts).toEqual(before.receipts);
  const listed = await w.questions("member");
  expect(listed).toEqual([{ id: expect.any(String), kind: "post", question: "Post this in #General as you?", text: words, items: [], canAlways: true }]);
  // Nobody else sees the member's question.
  expect(await w.questions("other")).toEqual([]);

  const yes = await w.answer("member", listed[0].id, "yes");
  expect(yes).toEqual({ status: "done", line: "Posted in #General as you.", path: expect.stringContaining("run-club") });
  const after = await w.rows();
  const posted = rootsBy(after.roots, w.ids.member).filter((row) => row.contentSummary === words);
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({ actorType: "human", status: "live" });
  expect(after.questions).toHaveLength(1);
  expect(after.questions[0]).toMatchObject({ status: "done", resultLine: "Posted in #General as you." });
  expect(await w.questions("member")).toEqual([]);

  // The same answer again is told what happened; nothing is posted twice.
  expect(await w.answer("member", listed[0].id, "yes")).toMatchObject({ status: "done", line: "Posted in #General as you." });
  expect(rootsBy((await w.rows()).roots, w.ids.member).filter((row) => row.contentSummary === words)).toHaveLength(1);
});

test("no: nothing is posted", async () => {
  const w = await world();
  const before = await w.rows();
  await w.guide("member")("polynet_write", post("Nobody should ever see this.", "post-no"));
  const [question] = await w.questions("member");
  expect(await w.answer("member", question.id, "no")).toEqual({ status: "declined", line: "Nothing was done.", path: null });
  const after = await w.rows();
  expect(after.roots).toEqual(before.roots);
  expect(after.receipts).toEqual(before.receipts);
  expect(after.questions[0]).toMatchObject({ status: "declined" });
  expect(await w.questions("member")).toEqual([]);
  // A later yes to the same question does nothing.
  expect(await w.answer("member", question.id, "yes")).toMatchObject({ status: "declined" });
  expect((await w.rows()).roots).toEqual(before.roots);
});

test("always allow: posted, the next post goes straight through, and switching it off brings the question back", async () => {
  const w = await world();
  await w.guide("member")("polynet_write", post("First one, asked about.", "post-a"));
  const [question] = await w.questions("member");
  expect(await w.answer("member", question.id, "always")).toMatchObject({ status: "done" });
  expect((await w.rows()).always).toEqual([expect.objectContaining({ userId: w.ids.member, communityId: w.ids.communityId, kind: "post" })]);
  expect(await w.t.withIdentity({ subject: "member-subject" }).query(api.communityGuideQuestions.getGuideAlwaysAllowed, { communityId: w.ids.communityId }))
    .toEqual({ post: true });

  const straight = await w.guide("member", "run-2")("polynet_write", { path: GENERAL, mode: "append",
    content: { root_id: String(w.ids.otherPost), text: "I'm in, see you there." }, idempotency_key: "reply-b" });
  expect(straight, JSON.stringify(straight)).toMatchObject({ ok: true });
  expect((straight as any).value.status).not.toBe("waiting_for_person");
  const replies = (await w.rows()).replies.filter((row: any) => String(row.actorUserId) === String(w.ids.member));
  expect(replies.map((row: any) => row.contentSummary)).toEqual(["I'm in, see you there."]);
  expect(await w.questions("member")).toEqual([]);
  // Always allow is the member's own: another member's guide still asks.
  expect(await w.guide("other")("polynet_write", post("The other member's words.", "post-other"))).toMatchObject({ value: { status: "waiting_for_person" } });

  expect(await w.t.withIdentity({ subject: "member-subject" }).mutation(api.communityGuideQuestions.setGuideAlwaysAllowed,
    { communityId: w.ids.communityId, kind: "post", on: false })).toEqual({ post: false });
  expect((await w.rows()).always.filter((row: any) => String(row.userId) === String(w.ids.member))).toEqual([]);
  expect(await w.guide("member", "run-3")("polynet_write", { path: GENERAL, mode: "append",
    content: { root_id: String(w.ids.otherPost), text: "Bringing a friend too." }, idempotency_key: "reply-c" }))
    .toMatchObject({ ok: true, value: { status: "waiting_for_person", question: "Reply with this in #General as you?" } });
});

test("a question from an earlier run is dropped when a new run asks", async () => {
  const w = await world();
  await w.guide("member", "run-old")("polynet_write", post("Words from the earlier turn.", "post-old"));
  const [old] = await w.questions("member");
  await w.guide("member", "run-new")("polynet_write", post("Words from this turn.", "post-new"));
  const listed = await w.questions("member");
  expect(listed.map((row) => row.text)).toEqual(["Words from this turn."]);
  expect(listed[0].id).not.toBe(old.id);
  // The old one can no longer be answered into a post.
  expect(await w.answer("member", old.id, "yes")).toMatchObject({ status: "declined" });
  expect((await w.rows()).roots.some((row: any) => row.contentSummary === "Words from the earlier turn.")).toBe(false);
  // The same call asked again in the same run is the same question.
  await w.guide("member", "run-new")("polynet_write", post("Words from this turn.", "post-new"));
  expect(await w.questions("member")).toEqual(listed);
});

test("the owner removes two posts through the guide after their yes; always allow is never kept for removing", async () => {
  const w = await world();
  const refs = [`interaction:root:${w.ids.otherPost}`, `interaction:root:${w.ids.memberPost}`];
  const before = await w.rows();
  const asked = await w.guide("owner")("polynet_call", removal(refs));
  expect(asked).toMatchObject({ ok: true, value: { status: "waiting_for_person", question: "Remove these 2 posts? They can't be brought back." } });
  expect((await w.rows()).roots).toEqual(before.roots);
  expect((await w.rows()).receipts).toEqual(before.receipts);
  const [question] = await w.questions("owner");
  expect(question).toEqual({ id: expect.any(String), kind: "remove", question: "Remove these 2 posts? They can't be brought back.", text: null,
    items: [{ who: "other", text: "Who is in for Saturday?" }, { who: "member", text: "Cheap shoes, click here" }], canAlways: false });

  // "always" is taken as yes for these posts only.
  const done = await w.answer("owner", question.id, "always");
  expect(done).toMatchObject({ status: "done", line: "2 posts were removed." });
  const after = await w.rows();
  expect(after.always).toEqual([]);
  for (const id of [w.ids.otherPost, w.ids.memberPost]) expect(after.roots.find((row: any) => row._id === id)).toMatchObject({ status: "deleted" });
  // The next removal still asks.
  const third = await w.door("other", "external_mcp")("polynet_write", post("Another one to remove.", "post-third"));
  expect(third).toMatchObject({ ok: true });
  expect(await w.guide("owner", "run-2")("polynet_call", removal([(third as any).value.ref], "remove-2")))
    .toMatchObject({ ok: true, value: { status: "waiting_for_person", question: "Remove this post? It can't be brought back." } });
});

test("a plain member's guide is not offered removing others' posts, and nothing is asked", async () => {
  const w = await world();
  const before = await w.rows();
  expect(await w.guide("member")("polynet_call", removal([`interaction:root:${w.ids.otherPost}`])))
    .toMatchObject({ ok: false, code: "operation_not_found" });
  const after = await w.rows();
  expect(after.questions).toEqual([]);
  expect(after.roots).toEqual(before.roots);
});

test("through the person's own AI, removing posts is still refused with person_only and nothing is removed", async () => {
  const w = await world();
  const before = await w.rows();
  expect(await w.door("owner", "external_mcp")("polynet_call", removal([`interaction:root:${w.ids.otherPost}`])))
    .toMatchObject({ ok: false, code: "person_only" });
  const after = await w.rows();
  expect(after.roots).toEqual(before.roots);
  expect(after.questions).toEqual([]);
});

test("the owner approves a join request through the guide, with no question", async () => {
  const w = await world();
  const { applicant, request } = await w.t.run(async (ctx) => {
    await ctx.db.patch(w.ids.communityId, { entryPolicy: "approval" } as any);
    const applicant = await ctx.db.insert("users", { authSubject: "applicant-subject", email: "applicant@example.com", createdAt: 100, updatedAt: 100 });
    const requestId = await ctx.db.insert("communityJoinRequests", { communityId: w.ids.communityId, userId: applicant, status: "pending", createdAt: 100, updatedAt: 100 });
    return { applicant, request: (await ctx.db.get(requestId))! };
  });
  const call = { operation: "community.admission.approve", version: 1, target: `${ROOT}capabilities/community.admission.approve.json`,
    input: { request_ref: `join-request:${request._id}`, expected_created_at: new Date(request.createdAt).toISOString(),
      expected_updated_at: new Date(request.updatedAt).toISOString() }, idempotency_key: "approve-1" };
  // A plain member's guide may not.
  expect(await w.guide("member")("polynet_call", call)).toMatchObject({ ok: false, code: "operation_not_found" });
  const approved = await w.guide("owner")("polynet_call", call);
  expect(approved, JSON.stringify(approved)).toMatchObject({ ok: true, value: { operation: "community.admission.approve", result: { status: "approved" } } });
  const state = await w.t.run(async (ctx) => ({
    request: await ctx.db.get(request._id),
    membership: (await ctx.db.query("communityMemberships").collect()).find((row) => String(row.userId) === String(applicant)),
  }));
  expect(state.request).toBeNull();
  expect(state.membership).toMatchObject({ state: "active", role: "member" });
  expect((await w.rows()).questions).toEqual([]);
});

test("a member reacts and marks a lesson done through the guide, with no question", async () => {
  const w = await world();
  const reacted = await w.guide("member")("polynet_call", { operation: "community.interaction.react", version: 1,
    target: `${ROOT}capabilities/community.interaction.react.json`, input: { ref: `interaction:root:${w.ids.otherPost}`, emoji: "🔥", on: true }, idempotency_key: "react-1" });
  expect(reacted, JSON.stringify(reacted)).toMatchObject({ ok: true, value: { result: { reacted: true } } });
  const done = await w.guide("member")("polynet_call", { operation: "community.lesson.set_done", version: 1,
    target: `${ROOT}capabilities/community.lesson.set_done.json`, input: { ref: `resource:${w.ids.lesson}`, done: true }, idempotency_key: "done-1" });
  expect(done, JSON.stringify(done)).toMatchObject({ ok: true, value: { result: { ref: `resource:${w.ids.lesson}`, done: true } } });
  const state = await w.t.run(async (ctx) => ({
    reactions: await ctx.db.query("communityInteractionReactions").collect(),
    progress: await ctx.db.query("communityLessonProgress").collect(),
  }));
  expect(state.reactions).toEqual([expect.objectContaining({ actorType: "human", actorUserId: w.ids.member, emoji: "🔥" })]);
  expect(state.progress).toEqual([expect.objectContaining({ userId: w.ids.member })]);
  expect((await w.rows()).questions).toEqual([]);
});

test("another person cannot answer someone's question", async () => {
  const w = await world();
  const before = await w.rows();
  await w.guide("member")("polynet_write", post("Only the member may send this.", "post-mine"));
  const [question] = await w.questions("member");
  for (const who of ["other", "owner"] as const) {
    await expect(w.answer(who, question.id, "yes")).rejects.toThrow("guide_question_not_found");
  }
  expect((await w.rows()).roots).toEqual(before.roots);
  expect(await w.questions("member")).toEqual([question]);
});

test("with the host's switch off, the guide's post is refused like the person's own AI, before any question; switched off while one waits, the yes is refused", async () => {
  const w = await world();
  const setPosting = (allowed: boolean) => w.t.withIdentity({ subject: "owner-subject" }).mutation((api as any).communityAiRules.setCommunityAiPosting,
    { authSubject: "owner-subject", communityId: w.ids.communityId, allowed });
  const before = await w.rows();
  // Asked while posting is allowed, then the host switches it off.
  expect(await w.guide("member")("polynet_write", post("Through the guide.", "post-guide"))).toMatchObject({ ok: true, value: { status: "waiting_for_person" } });
  const [question] = await w.questions("member");
  await setPosting(false);
  const result = await w.answer("member", question.id, "yes");
  expect(result).toMatchObject({ status: "failed", path: null });
  expect(result.line).toContain("turned off posting through AIs");
  // Off: the guide is refused and the person is not asked (the new-post
  // limit for the channel, shared by both doors, may answer first).
  expect(await w.guide("member")("polynet_write", post("Again through the guide.", "post-guide-2"))).toMatchObject({ ok: false });
  expect(await w.questions("member")).toEqual([]);
  const ownAi = { message: result.line };
  const after = await w.rows();
  expect(after.roots).toEqual(before.roots);
  expect(after.questions.find((row: any) => String(row._id) === question.id)).toMatchObject({ status: "failed", resultLine: (ownAi as any).message });
});

test("a channel path with any mode but create or append is refused through both doors, never taken as a post", async () => {
  const w = await world();
  const before = await w.rows();
  const sneaky = { path: "/communities/run-club/channels/general/", mode: "delete", content: { text: "Posted without a yes." }, idempotency_key: "sneaky" };
  expect(await w.guide("member")("polynet_write", sneaky)).toMatchObject({ ok: false, code: "invalid_tool_args" });
  expect(await w.door("member", "external_mcp")("polynet_write", sneaky)).toMatchObject({ ok: false, code: "invalid_tool_args" });
  const after = await w.rows();
  expect(after.roots).toEqual(before.roots);
  expect(await w.questions("member")).toEqual([]);
});

const call = (operation: string, input: Record<string, unknown>, key: string) => ({ operation, version: 1,
  target: `${ROOT}capabilities/${operation}.json`, input, idempotency_key: key });

test("the owner's guide makes and renames a channel when told, with no question; a member's guide is not offered it", async () => {
  const w = await world();
  const made: any = await w.guide("owner")("polynet_call", call("community.channel.create", { name: "Race reports" }, "ch-1"));
  expect(made).toMatchObject({ ok: true });
  expect(await w.questions("owner")).toEqual([]);
  const channels = await w.t.run((ctx) => ctx.db.query("communityChannels").collect());
  expect(channels.map((row: any) => row.name)).toContain("Race reports");
  expect(await w.guide("member")("polynet_call", call("community.channel.create", { name: "Mine" }, "ch-2"))).toMatchObject({ ok: false, code: "operation_not_found" });
  expect((await w.rows()).questions).toEqual([]);
});

test("a role change through the guide waits for the owner's yes, every time, and names the person and their role now", async () => {
  const w = await world();
  const role = (who: "member" | "other", to: string, key: string) => call("community.members.set_role", { members: [`user:${String(w.ids[who])}`], role: to }, key);
  const membership = async (who: "member" | "other") => (await w.t.run((ctx) => ctx.db.query("communityMemberships").collect()))
    .find((row: any) => String(row.userId) === String(w.ids[who]))!;
  expect(await w.guide("owner")("polynet_call", role("member", "admin", "role-1"))).toMatchObject({ ok: true, value: { status: "waiting_for_person", question: "Make member an admin?" } });
  expect((await membership("member")).role).toBe("member");
  const [question] = await w.questions("owner");
  expect(question).toMatchObject({ kind: "change", items: [{ who: "member", text: "Now: member" }], canAlways: false });
  // "Always" is not kept for this: it changes this once.
  expect(await w.answer("owner", question.id, "always")).toEqual({ status: "done", line: "Their role was changed.", path: null });
  expect((await membership("member")).role).toBe("admin");
  expect((await w.rows()).always).toEqual([]);
  expect(await w.guide("owner", "run-2")("polynet_call", role("other", "moderator", "role-2"))).toMatchObject({ ok: true, value: { status: "waiting_for_person" } });
  expect((await membership("other")).role).toBe("member");
  // A plain member's guide is not offered it, and nothing is asked.
  expect(await w.guide("other")("polynet_call", role("member", "member", "role-3"))).toMatchObject({ ok: false, code: "operation_not_found" });
  expect(await w.questions("other")).toEqual([]);
});

test("publishing the handbook through the guide shows the exact text and waits for the owner's yes", async () => {
  const w = await world();
  const words = "# Start here\nWe run at dawn on Saturdays.";
  expect(await w.guide("owner")("polynet_call", call("community.handbook.approve", { text: words }, "hb-1")))
    .toMatchObject({ ok: true, value: { status: "waiting_for_person", question: "Publish this handbook to every member?" } });
  const [question] = await w.questions("owner");
  expect(question).toMatchObject({ kind: "change", text: words, canAlways: false });
  expect(await w.answer("owner", question.id, "yes")).toMatchObject({ status: "done", line: "The handbook members see was changed." });
  // A long handbook is shown whole, never cut.
  const long = `# Start here\n${"We run at dawn. ".repeat(350)}`.trim();
  expect(await w.guide("owner", "run-2")("polynet_call", call("community.handbook.approve", { text: long }, "hb-2"))).toMatchObject({ ok: true, value: { status: "waiting_for_person" } });
  expect((await w.questions("owner"))[0].text).toBe(long);
});

test("through a person's own AI, removing or banning a member stays the person's, and opening the community stays the person's through both doors", async () => {
  const w = await world();
  const ownAi = w.door("owner", "external_mcp");
  expect(await ownAi("polynet_call", call("community.members.remove", { members: [`user:${String(w.ids.other)}`] }, "rm-1"))).toMatchObject({ ok: false, code: "person_only" });
  expect(await ownAi("polynet_call", call("community.members.ban", { members: [`user:${String(w.ids.other)}`] }, "ban-1"))).toMatchObject({ ok: false, code: "person_only" });
  for (const door of [w.guide("owner"), ownAi]) {
    expect(await door("polynet_call", call("community.join_mode.set", { mode: "open" }, "open-1"))).toMatchObject({ ok: false, code: "person_only" });
  }
  expect((await w.rows()).questions).toEqual([]);
  const memberships = await w.t.run((ctx) => ctx.db.query("communityMemberships").collect());
  expect(memberships.every((row: any) => row.state === "active")).toBe(true);
});

const membershipOf = async (w: Awaited<ReturnType<typeof world>>, who: "member" | "other") =>
  (await w.t.run((ctx) => ctx.db.query("communityMemberships").collect())).find((row: any) => String(row.userId) === String(w.ids[who]))!;

test("removing a member through the guide waits for the owner's yes, every time, names them, and runs the Members page's own removal", async () => {
  const w = await world();
  const remove = (who: "member" | "other", key: string) => call("community.members.remove", { members: [who] }, key);
  expect(await w.guide("owner")("polynet_call", remove("other", "rm-1"))).toEqual({ ok: true, value: { ok: true, status: "waiting_for_person",
    question: "Remove other? They lose access and can ask to join again later. Anyone paying loses their subscription.", note: expect.any(String) } });
  // Nothing changes until the yes.
  expect((await membershipOf(w, "other")).state).toBe("active");
  const [question] = await w.questions("owner");
  expect(question).toMatchObject({ kind: "remove", items: [{ who: "other", text: "Now: member" }], canAlways: false });
  // "Always" is never kept for this: it removes them this once.
  expect(await w.answer("owner", question.id, "always")).toEqual({ status: "done", line: "They were removed.", path: null });
  expect((await w.rows()).always).toEqual([]);
  expect(await membershipOf(w, "other")).toMatchObject({ state: "removed", revokedReason: "removed_by_manager" });
  // As in the app, they may ask to join again after a while.
  const requests = await w.t.run((ctx) => ctx.db.query("communityJoinRequests").collect());
  expect(requests).toEqual([expect.objectContaining({ userId: w.ids.other, status: "denied" })]);
  // The next one is asked again; no says nothing is done.
  expect(await w.guide("owner", "run-2")("polynet_call", remove("member", "rm-2"))).toMatchObject({ ok: true, value: { status: "waiting_for_person" } });
  const [next] = await w.questions("owner");
  expect(await w.answer("owner", next.id, "no")).toMatchObject({ status: "declined" });
  expect((await membershipOf(w, "member")).state).toBe("active");
  // Someone no longer here is not asked about.
  const before = (await w.rows()).questions.length;
  expect(await w.guide("owner", "run-3")("polynet_call", remove("other", "rm-3"))).toMatchObject({ ok: false, code: "member_not_found" });
  expect((await w.rows()).questions).toHaveLength(before);
});

test("banning through the guide shows who and why, waits for the yes, and bans as the Members page does", async () => {
  const w = await world();
  const ban = call("community.members.ban", { members: ["member"], reason: "Spam links in #general" }, "ban-1");
  expect(await w.guide("owner")("polynet_call", ban)).toMatchObject({ ok: true, value: { status: "waiting_for_person",
    question: "Ban member? They can't rejoin unless unbanned. Anyone paying loses their subscription." } });
  expect(await w.t.run((ctx) => ctx.db.query("communityBlocks").collect())).toEqual([]);
  const [question] = await w.questions("owner");
  expect(question).toMatchObject({ kind: "remove", text: "Reason: Spam links in #general", items: [{ who: "member", text: "Now: member" }], canAlways: false });
  expect(await w.answer("owner", question.id, "yes")).toEqual({ status: "done", line: "They were banned.", path: null });
  expect(await w.t.run((ctx) => ctx.db.query("communityBlocks").collect())).toEqual([expect.objectContaining({ userId: w.ids.member, reason: "Spam links in #general" })]);
  expect(await membershipOf(w, "member")).toMatchObject({ state: "removed", revokedReason: "banned_by_manager" });
});

test("the owner is never removed or banned, nobody is asked about a stranger, and only the owner removes an admin", async () => {
  const w = await world();
  for (const operation of ["community.members.remove", "community.members.ban"]) {
    expect(await w.guide("owner")("polynet_call", call(operation, { members: ["owner"] }, `${operation}-owner`)))
      .toMatchObject({ ok: false, code: "owner_fixed", message: "The owner can't be removed or banned." });
    expect(await w.guide("owner")("polynet_call", call(operation, { members: ["nobody-here"] }, `${operation}-nobody`)))
      .toMatchObject({ ok: false, code: "member_not_found" });
  }
  expect((await w.rows()).questions).toEqual([]);
  // A plain member's guide is not offered it.
  expect(await w.guide("other")("polynet_call", call("community.members.remove", { members: ["member"] }, "rm-m"))).toMatchObject({ ok: false, code: "operation_not_found" });
  // An admin asking to remove another admin is told so at once: nobody is asked for a yes that could only fail.
  await w.t.run(async (ctx) => { for (const row of await ctx.db.query("communityMemberships").collect()) await ctx.db.patch(row._id, { role: "admin" }); });
  expect(await w.guide("member")("polynet_call", call("community.members.remove", { members: ["other"] }, "rm-a")))
    .toMatchObject({ ok: false, code: "owner_only", message: "Only the owner removes or bans an admin." });
  expect(await w.questions("member")).toEqual([]);
  expect((await membershipOf(w, "other")).state).toBe("active");
});

test("a builder makes, changes and cancels an event through the guide and through their own AI, with no question; a member is not offered it", async () => {
  const w = await world();
  const events = async () => (await w.t.run((ctx) => ctx.db.query("communityEvents").collect()))
    .map((row: any) => ({ id: String(row._id), title: row.title, status: row.status, location: row.locationLabel ?? null }));
  const before = await events();
  // Made through the guide, when told.
  const made: any = await w.guide("owner")("polynet_call", call("community.event.create",
    { title: "Hill repeats", starts_at: "2027-01-09T07:00:00-05:00", timezone: "America/New_York", location_type: "physical", location_label: "Reservoir gate" }, "ev-1"));
  expect(made).toMatchObject({ ok: true, value: { result: { event: { title: "Hill repeats", status: "live", location_label: "Reservoir gate", timezone: "America/New_York" } } } });
  expect(await w.questions("owner")).toEqual([]);
  const eventId = made.value.result.event.parent_event_id;
  // It is in the listing every member reads.
  const listed: any = await w.door("member", "external_mcp")("polynet_list", { path: `${ROOT}events/` });
  expect(JSON.stringify(listed.value)).toContain("Hill repeats");
  // Changed through their own AI: only the field given.
  const changed: any = await w.door("owner", "external_mcp")("polynet_call", call("community.event.update", { event: eventId, location_label: "Boathouse" }, "ev-2"));
  expect(changed).toMatchObject({ ok: true, value: { result: { event: { title: "Hill repeats", location_label: "Boathouse" } } } });
  // The same call again replays; it doesn't make or change anything twice.
  await w.guide("owner")("polynet_call", call("community.event.create",
    { title: "Hill repeats", starts_at: "2027-01-09T07:00:00-05:00", timezone: "America/New_York", location_type: "physical", location_label: "Reservoir gate" }, "ev-1"));
  expect(await events()).toHaveLength(before.length + 1);
  // Refused in plain words: a time that isn't one, an event that isn't here.
  expect(await w.guide("owner")("polynet_call", call("community.event.create", { title: "Bad", starts_at: "next Saturday", timezone: "America/New_York" }, "ev-3")))
    .toMatchObject({ ok: false, code: "invalid_tool_args", message: expect.stringContaining("ISO") });
  expect(await w.guide("owner")("polynet_call", call("community.event.update", { event: "nope", title: "X" }, "ev-4"))).toMatchObject({ ok: false, code: "event_not_found" });
  expect(await w.guide("owner")("polynet_call", call("community.event.create", { title: "Extra", starts_at: "2027-01-09T07:00:00-05:00", timezone: "America/New_York", status: "cancelled" }, "ev-5")))
    .toMatchObject({ ok: false, code: "invalid_tool_args" });
  // A member is offered none of it, through either door.
  for (const door of [w.guide("member"), w.door("member", "external_mcp")]) {
    expect(await door("polynet_call", call("community.event.cancel", { event: eventId }, "ev-6"))).toMatchObject({ ok: false, code: "operation_not_found" });
  }
  // Cancelled through the guide: it stays, marked cancelled.
  expect(await w.guide("owner")("polynet_call", call("community.event.cancel", { event: eventId }, "ev-7")))
    .toMatchObject({ ok: true, value: { result: { event: { status: "cancelled" } } } });
  expect((await events()).find((row) => row.id === eventId)).toMatchObject({ title: "Hill repeats", status: "cancelled", location: "Boathouse" });
  expect((await w.rows()).questions).toEqual([]);
});

test("what a real AI tripped on: a missing folder says so, a cut-off list says there is more, a delete says what it did, canManage means what this AI may change", async () => {
  const w = await world();
  const own = w.door("member", "external_mcp");
  expect(await own("polynet_list", { path: `${ROOT}members/other/` })).toMatchObject({ ok: false, message: expect.stringContaining("no folder at that path") });
  expect(await own("polynet_list", { path: `${ROOT}members/../users/` })).toMatchObject({ ok: false, message: expect.stringContaining("traversal-free") });
  const made: any = await own("polynet_write", post("Mine, briefly.", "mine-1"));
  const gone: any = await own("polynet_write", { path: made.value.path, mode: "delete", content: {}, idempotency_key: "mine-2" });
  expect(gone).toMatchObject({ ok: true, value: { done: "deleted" } });
  const channelsFor = async (door: any) => ((await door("polynet_list", { path: `${ROOT}channels/` })) as any).value.entries
    .map((entry: any) => entry.capabilities?.canManage);
  for (const door of [w.door("owner", "external_mcp"), w.guide("owner")]) expect(await channelsFor(door)).toEqual([true]);
  for (const door of [w.door("member", "external_mcp"), w.guide("member")]) expect(await channelsFor(door)).toEqual([false]);
});

test("the named tools a person's own AI is shown do the real thing, end to end, with no key to invent", async () => {
  const w = await world();
  // What the MCP does with a named tool: translate it, then run it as that person's own AI.
  const named = (who: "member" | "owner") => async (name: string, args: Record<string, unknown>): Promise<any> => {
    const translated = translateActionTool(actionTool(name)!, args, Date.now());
    return await w.door(who, "external_mcp")(translated.toolName, translated.input);
  };
  const member = named("member");
  const owner = named("owner");
  const C = "run-club";

  // A member: post, reply, edit, react, lesson, read, delete.
  const posted = await member("polynet_post", { community: C, channel: "general", text: "Easy five tomorrow, anyone?" });
  expect(posted).toMatchObject({ ok: true, value: { ref: expect.stringMatching(/^interaction:root:/) } });
  const mine = posted.value.ref;
  // The very same post again is a retry, not a second post.
  expect(await member("polynet_post", { community: C, channel: "general", text: "Easy five tomorrow, anyone?" })).toMatchObject({ ok: true, value: { ref: mine, deduped: true } });
  expect(await member("polynet_reply", { community: C, channel: "general", post: mine, text: "Meeting at the boathouse." })).toMatchObject({ ok: true });
  expect(await member("polynet_edit_post", { community: C, channel: "general", post: mine, text: "Easy five tomorrow at 7, anyone?" })).toMatchObject({ ok: true, value: { done: "edited" } });
  expect(await member("polynet_react", { community: C, post: `interaction:root:${String(w.ids.otherPost)}`, emoji: "👍" })).toMatchObject({ ok: true, value: { result: { reacted: true } } });
  expect(await member("polynet_mark_lesson_done", { community: C, lesson: `resource:${String(w.ids.lesson)}` })).toMatchObject({ ok: true, value: { result: { done: true } } });
  expect(await member("polynet_mark_channel_read", { community: C, channel: "general" })).toMatchObject({ ok: true });
  expect(await member("polynet_delete_post", { community: C, channel: "general", post: mine })).toMatchObject({ ok: true, value: { done: "deleted" } });
  // A member using a builder's tool is refused for that community, whatever they were shown.
  expect(await member("polynet_create_channel", { community: C, name: "Mine" })).toMatchObject({ ok: false, code: "operation_not_found" });

  // A builder: channels, events, the guide's instructions, the handbook draft, a role.
  const channel = await owner("polynet_create_channel", { community: C, name: "Race reports" });
  expect(channel).toMatchObject({ ok: true, value: { result: { channel: { name: "Race reports" } } } });
  const slug = channel.value.result.channel.slug;
  expect(await owner("polynet_describe_channel", { community: C, channel: slug, description: "How it went." })).toMatchObject({ ok: true, value: { result: { channel: { description: "How it went." } } } });
  expect(await owner("polynet_rename_channel", { community: C, channel: slug, name: "Races" })).toMatchObject({ ok: true, value: { result: { channel: { name: "Races" } } } });
  expect(await owner("polynet_move_channel", { community: C, channel: slug })).toMatchObject({ ok: true });
  const event = await owner("polynet_create_event", { community: C, title: "Track night", starts_at: "2027-02-03T18:30:00-05:00", timezone: "America/New_York" });
  expect(event).toMatchObject({ ok: true, value: { result: { event: { title: "Track night", status: "live" } } } });
  const eventId = event.value.result.event.parent_event_id;
  expect(await owner("polynet_update_event", { community: C, event: eventId, location_label: "High school track" })).toMatchObject({ ok: true, value: { result: { event: { location_label: "High school track" } } } });
  expect(await owner("polynet_cancel_event", { community: C, event: eventId })).toMatchObject({ ok: true, value: { result: { event: { status: "cancelled" } } } });
  expect(await owner("polynet_set_guide_instructions", { community: C, text: "Keep answers short." })).toMatchObject({ ok: true });
  expect(await owner("polynet_save_handbook_draft", { community: C, text: "# Start here" })).toMatchObject({ ok: true });
  expect(await owner("polynet_require_approval_to_join", { community: C })).toMatchObject({ ok: true });
  expect(await owner("polynet_set_member_role", { community: C, members: [`user:${String(w.ids.member)}`], role: "moderator" })).toMatchObject({ ok: true, value: { result: { succeeded: 1 } } });
  // Nothing here was held for a yes: that is the guide's way of asking, not a person's own AI's.
  expect((await w.rows()).questions).toEqual([]);
});

test("through a person's own AI, an action's file points at its named tool, and what only a person does gives the link instead", async () => {
  const w = await world();
  const file = async (who: "owner", door: "external_mcp" | "community_agent_for_member", operation: string) =>
    JSON.parse(((await w.door(who, door)("polynet_read", { path: `${ROOT}capabilities/${operation}.json` })) as any).value.body);
  const react = await file("owner", "external_mcp", "community.interaction.react");
  expect(react).toMatchObject({ tool: "polynet_react", call: expect.stringContaining("polynet_react") });
  const ban = await file("owner", "external_mcp", "community.members.ban");
  expect(ban).toMatchObject({ tool: null, done_by: expect.stringContaining("a person"), give_the_person_this_link: expect.stringContaining("/c/run-club/members") });
  expect(ban.call).toBeUndefined();
  const remove = await file("owner", "external_mcp", "community.interaction.remove");
  expect(remove).toMatchObject({ tool: null, give_the_person_this_link: expect.stringContaining("/c/run-club/chat") });
  // The guide has its named tools too, so its files point there; removing posts is its own tool (after the person's yes).
  expect(await file("owner", "community_agent_for_member", "community.interaction.react")).toMatchObject({ tool: "polynet_react", call: expect.stringContaining("polynet_react") });
  expect(await file("owner", "community_agent_for_member", "community.interaction.remove")).toMatchObject({ tool: "polynet_remove_posts" });
});

test("in a member's private talk the guide acts by named tools only, in the talk's own community", async () => {
  const w = await world();
  const nowMs = Date.now();
  // A second community the member is also in, to show the talk's community wins.
  const elsewhere = await w.t.run(async (ctx) => {
    const communityId = await ctx.db.insert("communities", { ownerId: w.ids.other, slug: "swim-club", name: "Swim club", oneLiner: "We swim.", about: "A club for swimmers.",
      visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 2, createdAt: nowMs, updatedAt: nowMs } as any);
    await ensureGeneralChannel({ ctx, communityId, nowMs });
    await ctx.db.insert("communityMemberships", { communityId, userId: w.ids.member, role: "member", accessSource: "free_grant", state: "active",
      activationSequence: 1, activatedAt: nowMs, createdAt: nowMs, updatedAt: nowMs });
    const threadId = await ctx.db.insert("threads", { ownerId: w.ids.member, titleSource: "auto", createdAt: nowMs, updatedAt: nowMs } as any);
    await ctx.db.insert("runtimeRuns", { ownerId: w.ids.member, threadId, runId: "talk-1", lane: "platform", communityId: w.ids.communityId, status: "running",
      lastEventSeq: 0, startedAt: nowMs, createdAt: nowMs, updatedAt: nowMs } as any);
    return communityId;
  });
  const as = w.t.withIdentity({ subject: "member-subject" });
  const ctx = { runQuery: (r: any, a: any) => as.query(r, a), runMutation: (r: any, a: any) => as.mutation(r, a), runAction: (r: any, a: any) => as.action(r, a) };
  const talk = (toolName: string, args: Record<string, unknown>) => runAgentTool({ ctx, userId: String(w.ids.member), authSubject: "member-subject",
    runId: "talk-1", communityId: String(w.ids.communityId), communityBoundConversation: true, evidenceSurface: "member_agent_dock", toolName, args });

  // A post waits for the member's yes: one question, nothing posted yet.
  const before = await w.rows();
  const posted = await talk("polynet_post", { channel: "general", text: "Hills on Thursday?" });
  expect(posted.status, JSON.stringify(posted)).toBe("ok");
  expect(posted.outputText).toContain("waiting_for_person");
  expect(await w.questions("member")).toEqual([expect.objectContaining({ kind: "post", text: "Hills on Thursday?" })]);
  expect((await w.rows()).roots).toEqual(before.roots);

  // A reaction just happens, with no question.
  const reacted = await talk("polynet_react", { post: `interaction:root:${String(w.ids.otherPost)}`, emoji: "🔥" });
  expect(reacted.status, JSON.stringify(reacted)).toBe("ok");
  const reactions = await w.t.run((ctx) => ctx.db.query("communityInteractionReactions").collect());
  expect(reactions).toEqual([expect.objectContaining({ actorUserId: w.ids.member, emoji: "🔥" })]);
  expect((await w.rows()).questions).toHaveLength(1);

  // Naming another community does nothing: the talk's own is used.
  const redirected = await talk("polynet_post", { community: "swim-club", channel: "general", text: "Pool at noon?" });
  expect(redirected.status, JSON.stringify(redirected)).toBe("ok");
  expect((await w.questions("member")).map((question: any) => question.text).sort()).toEqual(["Hills on Thursday?", "Pool at noon?"]);
  expect(await as.query(api.communityGuideQuestions.listGuideQuestions, { communityId: elsewhere })).toEqual([]);

  // The general action tools are not the guide's.
  const write = await talk("polynet_write", post("Straight in.", "direct-1"));
  expect(write).toMatchObject({ status: "error", errorCode: "tool_not_in_lens" });
  const call = await talk("polynet_call", { operation: "community.interaction.react", version: 1,
    target: `${ROOT}capabilities/community.interaction.react.json`, input: { ref: `interaction:root:${String(w.ids.memberPost)}`, emoji: "👍", on: true }, idempotency_key: "direct-2" });
  expect(call).toMatchObject({ status: "error", errorCode: "tool_not_in_lens" });
  // A reply in a conversation that isn't the member's finds nothing, and asks nothing.
  expect(await talk("polynet_reply_message", { conversation: "abcd1234", text: "Hi" })).toMatchObject({ status: "error", errorCode: "semantic_not_found" });
  // A builder's tool, called by a member's guide, is refused by the executor for this role.
  expect(await talk("polynet_create_channel", { name: "Mine" })).toMatchObject({ status: "error", errorCode: "operation_not_found" });
  const after = await w.rows();
  // Nothing was posted (the reaction only changed a post's reaction count).
  expect(after.roots.map((row: any) => row._id)).toEqual(before.roots.map((row: any) => row._id));
  expect(after.replies).toEqual(before.replies);
  expect(after.questions).toHaveLength(2);
  expect((await w.t.run((ctx) => ctx.db.query("communityChannels").collect())).map((row: any) => row.name)).not.toContain("Mine");
});

test("a person is named to an AI by their handle; someone who isn't here is refused by name, and nobody is asked about a stranger", async () => {
  const w = await world();
  const role = (members: string[], key: string) => call("community.members.set_role", { members, role: "moderator" }, key);
  // By handle, with or without @: the question names the real person.
  expect(await w.guide("owner")("polynet_call", role(["@member"], "h-1"))).toMatchObject({ ok: true, value: { status: "waiting_for_person", question: "Make member a moderator?" } });
  const [question] = await w.questions("owner");
  expect(question.items).toEqual([{ who: "member", text: "Now: member" }]);
  // The saved call names them by id, so the yes changes exactly who was shown.
  expect(await w.answer("owner", question.id, "yes")).toMatchObject({ status: "done" });
  const membership = (await w.t.run((ctx) => ctx.db.query("communityMemberships").collect())).find((row: any) => String(row.userId) === String(w.ids.member))!;
  expect(membership.role).toBe("moderator");
  // A made-up reference, or someone not in this community: refused by name, through both doors, with no question.
  for (const door of [w.guide("owner", "run-2"), w.door("owner", "external_mcp")]) {
    expect(await door("polynet_call", role(["user:PriyaShah"], "h-2"))).toMatchObject({ ok: false, code: "member_not_found", message: expect.stringContaining('"user:PriyaShah"') });
    expect(await door("polynet_call", role(["other", "nobody-here"], "h-3"))).toMatchObject({ ok: false, code: "member_not_found", message: expect.stringContaining('"nobody-here"') });
  }
  expect(await w.questions("owner")).toEqual([]);
  // A person's own AI can use a handle too.
  expect(await w.door("owner", "external_mcp")("polynet_call", role(["other"], "h-4"))).toMatchObject({ ok: true, value: { result: { succeeded: 1 } } });
});

test("in the guide's talk the server makes the retry key per tool call and reads the settings revision itself", async () => {
  const w = await world();
  const nowMs = Date.now();
  await w.t.run(async (ctx) => {
    for (const [ownerId, runId] of [[w.ids.member, "talk-k"], [w.ids.owner, "talk-o"]] as const) {
      const threadId = await ctx.db.insert("threads", { ownerId, titleSource: "auto", createdAt: nowMs, updatedAt: nowMs } as any);
      await ctx.db.insert("runtimeRuns", { ownerId, threadId, runId, lane: "platform", communityId: w.ids.communityId, status: "running",
        lastEventSeq: 0, startedAt: nowMs, createdAt: nowMs, updatedAt: nowMs } as any);
    }
  });
  const talkAs = (who: "member" | "owner", runId: string) => {
    const as = w.t.withIdentity({ subject: `${who}-subject` });
    const ctx = { runQuery: (r: any, a: any) => as.query(r, a), runMutation: (r: any, a: any) => as.mutation(r, a), runAction: (r: any, a: any) => as.action(r, a) };
    return (toolName: string, args: Record<string, unknown>, toolCallId: string) => runAgentTool({ ctx, userId: String(w.ids[who]), authSubject: `${who}-subject`,
      runId, toolCallId, communityId: String(w.ids.communityId), communityBoundConversation: true, evidenceSurface: "member_agent_dock", toolName, args });
  };
  const member = talkAs("member", "talk-k");
  // Two different posts that both carry the same invented key: two questions,
  // each under its own server key; the invented one is never used.
  expect(await member("polynet_post", { channel: "general", text: "Hills?", idempotency_key: "post-20261118" }, "call_1")).toMatchObject({ status: "ok" });
  expect(await member("polynet_post", { channel: "general", text: "Track?", idempotency_key: "post-20261118" }, "call_2")).toMatchObject({ status: "ok" });
  // The very same call again is the same question.
  await member("polynet_post", { channel: "general", text: "Hills?" }, "call_1");
  // The same words asked again under a new call in the same turn are still one question.
  await member("polynet_post", { channel: "general", text: "Hills?" }, "call_3");
  const keys = (await w.rows()).questions.map((row: any) => JSON.parse(row.inputJson).idempotencyKey);
  expect(keys).toEqual([guideActionKey("talk-k", "call_1"), guideActionKey("talk-k", "call_2")]);
  // The yes runs the call under the key the question saved.
  const hills = (await w.questions("member")).find((question: any) => question.text === "Hills?")!;
  expect(await w.answer("member", hills.id, "yes")).toMatchObject({ status: "done" });
  expect((await w.rows()).receipts.map((row: any) => row.idempotencyKey)).toContain(guideActionKey("talk-k", "call_1"));

  // Settings: no revision from the guide, or a wrong one, and it still works,
  // because the server reads the revision right before the change.
  const owner = talkAs("owner", "talk-o");
  expect(await owner("polynet_update_community", { one_liner: "We run hills." }, "call_a"), "first").toMatchObject({ status: "ok" });
  expect(await owner("polynet_update_community", { one_liner: "We run far.", revision: 0 }, "call_b"), "second").toMatchObject({ status: "ok" });
  const community: any = await w.t.run((ctx) => ctx.db.get(w.ids.communityId));
  expect(community.oneLiner).toBe("We run far.");

  // The guide's context carries the community's time zone: its most recent
  // event's, never a pod call's; none before there is an event.
  const context = () => w.t.withIdentity({ subject: "member-subject" }).query(internal.communityAgent.resolveRuntimeCommunityPromptContextInternal,
    { authSubject: "member-subject", userId: w.ids.member, communityId: w.ids.communityId });
  expect((await context()).community_lens).not.toHaveProperty("timeZone");
  await w.t.run(async (ctx) => {
    const event = { communityId: w.ids.communityId, createdByUserId: w.ids.owner, title: "Long run", startsAt: nowMs + 86_400_000, locationType: "physical" as const,
      visibility: "members" as const, status: "live" as const, createdAt: nowMs, updatedAt: nowMs };
    await ctx.db.insert("communityEvents", { ...event, timezone: "America/Denver" });
    const pod = await ctx.db.query("communityChannels").first();
    await ctx.db.insert("communityEvents", { ...event, timezone: "Asia/Tokyo", podChannelId: pod!._id });
  });
  expect((await context()).community_lens).toMatchObject({ timeZone: "America/Denver" });
});
