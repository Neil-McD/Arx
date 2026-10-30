/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";

const modules = import.meta.glob([
  "./communityPostCards.ts", "./communityPostCardRead.ts", "./communityInteractions.ts", "./communityInteractionEvidence.ts",
  "./communityForms.ts", "./communityFormRequests.ts", "./communityMentionBroadcasts.ts", "./communityMentionLifecycle.ts",
  "./communityAgentServeWorker.ts", "./communityMemberWorkflows.ts", "./_generated/**/*.*s",
]);

async function fixture(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const users: Record<string, any> = {};
    for (const name of ["owner", "member", "other", "outsider"]) {
      users[name] = await ctx.db.insert("users", {
        authSubject: name, handle: name, normalizedHandle: name, displayName: name, createdAt: 1, updatedAt: 1,
      });
      await ctx.db.insert("userProfileDetails", {
        userId: users[name], displayName: `${name} name`, avatarUrl: `https://example.com/${name}.png`, createdAt: 1, updatedAt: 1,
      });
      for (const document of PLATFORM_LEGAL_DOCUMENTS) {
        await ctx.db.insert("legalAcceptances", {
          userId: users[name], documentKey: document.key, documentVersion: document.version, acceptedAt: 1, source: "test", createdAt: 1,
        });
      }
    }
    const communityId = await ctx.db.insert("communities", {
      ownerId: users.owner, name: "Cards", slug: "cards", visibility: "unlisted",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 3, createdAt: 1, updatedAt: 1,
    });
    for (const name of ["member", "other"]) {
      await ctx.db.insert("communityMemberships", {
        communityId, userId: users[name], role: "member", active: true, accessSource: "manual_grant", createdAt: 1, updatedAt: 1,
      });
    }
    const channelId = await ctx.db.insert("communityChannels", {
      communityId, systemRole: "general", name: "General", slug: "general", accessMode: "all_members",
      postingPolicy: "members", status: "active", position: 0, createdAt: 1, updatedAt: 1,
    });
    return { communityId, channelId, users };
  });
}

async function cardOf(t: ReturnType<typeof convexTest>, subject: string, communityId: any, rootId: string) {
  const feed = await t.withIdentity({ subject }).query(api.communityInteractions.listCommunityInteractionRoots, { communityId });
  return feed.roots.find((bundle: any) => bundle.root.id === rootId)?.post_card as any;
}

test("a member's poll is public: counts, voters and each viewer's own choice", async () => {
  const t = convexTest(schema, modules), f = await fixture(t);
  const asMember = t.withIdentity({ subject: "member" });
  const asOther = t.withIdentity({ subject: "other" });
  const poll = { communityId: f.communityId, idempotencyKey: "poll-1", question: "Next topic?", options: ["Skills", "Hooks", "MCP"] };
  const { root_id: rootId } = await asMember.mutation(api.communityPostCards.createPollPost, poll);
  // A retry of the same post makes no second poll.
  expect((await asMember.mutation(api.communityPostCards.createPollPost, poll)).root_id).toBe(rootId);
  expect(await t.run(async (ctx) => (await ctx.db.query("communityInteractionPolls").collect()).length)).toBe(1);

  await asMember.mutation(api.communityPostCards.votePostPoll, { rootId, optionKeys: ["o2"] });
  await asOther.mutation(api.communityPostCards.votePostPoll, { rootId, optionKeys: ["o2"] });
  await expect(asOther.mutation(api.communityPostCards.votePostPoll, { rootId, optionKeys: ["o1", "o3"] }))
    .rejects.toThrow("poll_choice_invalid");
  await asOther.mutation(api.communityPostCards.votePostPoll, { rootId, optionKeys: ["o3"] });

  const seenByMember = await cardOf(t, "member", f.communityId, rootId);
  expect(seenByMember).toMatchObject({ kind: "poll", question: "Next topic?", total_voters: 2, viewer_choices: ["o2"], can_close: true });
  expect(seenByMember.options.map((option: any) => [option.label, option.count])).toEqual([["Skills", 0], ["Hooks", 1], ["MCP", 1]]);
  expect(seenByMember.options[2].voters).toEqual([{ user_id: "other", name: "other name", avatar_url: "https://example.com/other.png" }]);
  expect(await cardOf(t, "other", f.communityId, rootId)).toMatchObject({ viewer_choices: ["o3"], can_close: false });
  expect((await cardOf(t, "owner", f.communityId, rootId)).can_close).toBe(true);

  // The post's own text is a readable fallback for surfaces without cards.
  const feed = await asMember.query(api.communityInteractions.listCommunityInteractionRoots, { communityId: f.communityId });
  expect(feed.roots[0]!.root.content_summary).toContain("Next topic?");

  await expect(asOther.mutation(api.communityPostCards.setPostPollClosed, { rootId, closed: true })).rejects.toThrow("community_forbidden");
  await t.withIdentity({ subject: "owner" }).mutation(api.communityPostCards.setPostPollClosed, { rootId, closed: true });
  await expect(asOther.mutation(api.communityPostCards.votePostPoll, { rootId, optionKeys: [] })).rejects.toThrow("poll_closed");
  await expect(t.withIdentity({ subject: "outsider" }).query(api.communityInteractions.listCommunityInteractionRoots, { communityId: f.communityId }))
    .rejects.toThrow();
  await expect(t.mutation(internal.communityPostCards.votePostPollForTrustedUserInternal, { trustedUserId: f.users.outsider, rootId, optionKeys: ["o1"] }))
    .rejects.toThrow();
});

test("owners share a published Form; members answer it once and see each other's answers only when allowed", async () => {
  const t = convexTest(schema, modules), f = await fixture(t);
  const asOwner = t.withIdentity({ subject: "owner" });
  const asMember = t.withIdentity({ subject: "member" });
  const questions = [
    { key: "goal", title: "Your goal", description: "", type: "short_text" as const, required: true, options: [] },
    { key: "level", title: "Level", description: "", type: "single_choice" as const, required: false, options: ["New", "Pro"] },
  ];
  await asOwner.mutation(api.communityForms.saveBuilderForm, { communityId: f.communityId, key: "intro", expectedRevision: 0, name: "Intro", questions });
  const share = { communityId: f.communityId, idempotencyKey: "form-1", formKey: "intro", note: "Tell us about you" };
  await expect(asOwner.mutation(api.communityPostCards.createFormPost, share)).rejects.toThrow("post_form_unpublished");
  await asOwner.mutation(api.communityForms.publishBuilderForm, { communityId: f.communityId, key: "intro", expectedRevision: 1 });
  await expect(asMember.mutation(api.communityPostCards.createFormPost, { ...share, idempotencyKey: "m" })).rejects.toThrow("community_forbidden");
  expect(await asOwner.query(api.communityPostCards.listShareablePostForms, { communityId: f.communityId }))
    .toEqual([{ key: "intro", name: "Intro", question_count: 2 }]);
  const { root_id: rootId } = await asOwner.mutation(api.communityPostCards.createFormPost, share);

  const form = await asMember.query(api.communityPostCards.getPostFormForViewer, { rootId });
  expect(form).toMatchObject({ name: "Intro", revision: 0, status: "none" });
  const draft = await asMember.mutation(api.communityPostCards.savePostFormAnswers, { rootId, expectedRevision: 0, answers: { goal: "Ship" }, submit: false });
  expect(await cardOf(t, "member", f.communityId, rootId)).toMatchObject({ viewer_status: "draft", response_count: 0 });
  await expect(asMember.mutation(api.communityPostCards.savePostFormAnswers, { rootId, expectedRevision: 0, answers: { goal: "x" }, submit: true }))
    .rejects.toThrow("form_answer_conflict");
  const answers = { goal: "Ship it", level: "1" };
  await asMember.mutation(api.communityPostCards.savePostFormAnswers, { rootId, expectedRevision: draft.revision, answers, submit: true });
  // An exact retry of the submit succeeds; changing sent answers does not.
  await asMember.mutation(api.communityPostCards.savePostFormAnswers, { rootId, expectedRevision: draft.revision, answers, submit: true });
  await expect(asMember.mutation(api.communityPostCards.savePostFormAnswers, { rootId, expectedRevision: 2, answers: { goal: "No" }, submit: true }))
    .rejects.toThrow("form_already_submitted");

  expect(await cardOf(t, "other", f.communityId, rootId)).toMatchObject({
    kind: "form", form_name: "Intro", note: "Tell us about you", question_count: 2, response_count: 1, viewer_status: "none", can_view_answers: true,
  });
  const visible = await t.withIdentity({ subject: "other" }).query(api.communityPostCards.listPostFormResponses, { rootId });
  expect(visible.rows[0]).toMatchObject({ person: { name: "member name" }, answers: [{ question: "Your goal", answer: "Ship it" }, { question: "Level", answer: "Pro" }] });

  await t.run(async (ctx) => {
    const row = (await ctx.db.query("communityInteractionFormShares").collect())[0]!;
    await ctx.db.patch(row._id, { answersVisibleTo: "builders" });
  });
  const hidden = await t.withIdentity({ subject: "other" }).query(api.communityPostCards.listPostFormResponses, { rootId });
  expect(hidden).toMatchObject({ can_view_answers: false, rows: [{ person: { name: "member name" }, answers: null }] });
  expect((await asOwner.query(api.communityPostCards.listPostFormResponses, { rootId })).rows[0]!.answers).toHaveLength(2);
});

test("anyone who can read a post sees who reacted, grouped by emoji", async () => {
  const t = convexTest(schema, modules), f = await fixture(t);
  const write = await t.withIdentity({ subject: "member" }).mutation(api.communityInteractions.createCommunityInteractionComposerMessage,
    { communityId: f.communityId, idempotencyKey: "post", text: "Hello" });
  const targetId = String(write.interaction.root_id);
  for (const [subject, emoji] of [["owner", "👍"], ["other", "👍"], ["member", "🔥"]] as const) {
    await t.withIdentity({ subject }).mutation(api.communityInteractions.toggleCommunityInteractionReaction, { targetType: "root", targetId, emoji });
  }
  const result = await t.withIdentity({ subject: "other" }).query(api.communityInteractions.listCommunityInteractionReactors, { targetType: "root", targetId });
  expect(result.reactions.map((group: any) => [group.emoji, group.people.map((person: any) => person.name)]))
    .toEqual([["👍", ["owner name", "other name"]], ["🔥", ["member name"]]]);
  expect(result.reactions[0].people[0]).toMatchObject({ user_id: "owner", avatar_url: "https://example.com/owner.png", is_agent: false });
  await expect(t.withIdentity({ subject: "outsider" }).query(api.communityInteractions.listCommunityInteractionReactors, { targetType: "root", targetId }))
    .rejects.toThrow();
});
