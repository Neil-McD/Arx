import { normalizeIdValue, requireCommunityManager, resolvePublicUserId } from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { POST_CARD_FACES, type PostCard, type PostCardPerson } from "../shared/communityPostCards";

// Reads a post's card for whoever is looking. Kept apart from the writes
// (communityPostCards.ts) so communityInteractions.ts can draw cards into the
// posts it lists without importing the composer back.

// Votes and responses counted per card; past this the count says "at least".
export const POST_CARD_READ_CAP = 2_000;

export type PostCardReadCache = {
  people: Map<string, Promise<PostCardPerson>>;
  publicIds: Map<string, string | null>;
  manages: Map<string, Promise<boolean>>;
};

export function newPostCardReadCache(): PostCardReadCache {
  return { people: new Map(), publicIds: new Map(), manages: new Map() };
}

export async function postCardPerson(ctx: any, userId: any, cache: PostCardReadCache): Promise<PostCardPerson> {
  const key = normalizeIdValue(userId);
  if (!cache.people.has(key)) {
    cache.people.set(key, (async () => {
      const [publicId, display] = await Promise.all([
        resolvePublicUserId(ctx, userId, cache.publicIds),
        resolveUserProfileDisplayProjection(ctx, userId),
      ]);
      return { user_id: publicId ?? key, name: display.display_name ?? "Member", avatar_url: display.avatar_url ?? null };
    })());
  }
  return await cache.people.get(key)!;
}

export async function viewerManagesCommunity(ctx: any, communityId: any, userId: any, cache: PostCardReadCache): Promise<boolean> {
  if (!userId) return false;
  const key = `${normalizeIdValue(communityId)}:${normalizeIdValue(userId)}`;
  if (!cache.manages.has(key)) {
    cache.manages.set(key, requireCommunityManager({ ctx, communityId, userId }).then(() => true, () => false));
  }
  return await cache.manages.get(key)!;
}

export async function readPollCard(ctx: any, poll: any, viewerUserId: any, cache: PostCardReadCache) {
  const votes = await ctx.db.query("communityInteractionPollVotes")
    .withIndex("by_poll", (q: any) => q.eq("pollId", poll._id)).take(POST_CARD_READ_CAP);
  const viewerKey = viewerUserId ? normalizeIdValue(viewerUserId) : null;
  const voters = new Set<string>();
  const options = await Promise.all((poll.options as Array<{ key: string; label: string }>).map(async (option) => {
    const rows = votes.filter((vote: any) => vote.optionKey === option.key);
    for (const row of rows) voters.add(normalizeIdValue(row.userId));
    // Newest voters first, so the faces show who just joined in.
    const recent = [...rows].sort((a: any, b: any) => b.createdAt - a.createdAt).slice(0, POST_CARD_FACES);
    return {
      key: option.key,
      label: option.label,
      count: rows.length,
      voters: await Promise.all(recent.map((row: any) => postCardPerson(ctx, row.userId, cache))),
    };
  }));
  const viewerChoices = viewerKey
    ? votes.filter((vote: any) => normalizeIdValue(vote.userId) === viewerKey).map((vote: any) => vote.optionKey)
    : [];
  const canClose = Boolean(viewerKey) && (normalizeIdValue(poll.createdByUserId) === viewerKey ||
    await viewerManagesCommunity(ctx, poll.communityId, viewerUserId, cache));
  return {
    kind: "poll" as const,
    id: normalizeIdValue(poll._id),
    question: poll.question,
    multiple: poll.multiple === true,
    closed: typeof poll.closedAt === "number",
    total_voters: voters.size,
    options,
    viewer_choices: viewerChoices,
    can_close: canClose,
  };
}

export async function readFormCard(ctx: any, share: any, viewerUserId: any, cache: PostCardReadCache) {
  const [version, responses] = await Promise.all([
    ctx.db.get(share.versionId),
    ctx.db.query("communityInteractionFormResponses")
      .withIndex("by_share", (q: any) => q.eq("shareId", share._id)).take(POST_CARD_READ_CAP),
  ]);
  const submitted = responses.filter((row: any) => row.status === "submitted")
    .sort((a: any, b: any) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));
  const viewerKey = viewerUserId ? normalizeIdValue(viewerUserId) : null;
  const own = viewerKey ? responses.find((row: any) => normalizeIdValue(row.userId) === viewerKey) : null;
  const manages = await viewerManagesCommunity(ctx, share.communityId, viewerUserId, cache);
  return {
    kind: "form" as const,
    id: normalizeIdValue(share._id),
    form_name: version?.name ?? "Form",
    note: share.note ?? "",
    question_count: version?.questions?.length ?? 0,
    answers_visible_to: share.answersVisibleTo,
    response_count: submitted.length,
    responders: await Promise.all(submitted.slice(0, POST_CARD_FACES).map((row: any) => postCardPerson(ctx, row.userId, cache))),
    viewer_status: own ? own.status : "none",
    can_view_answers: manages || share.answersVisibleTo === "everyone",
  };
}

// The card on a post, or null. Roots written before cards existed have no cardKind.
export async function readPostCardForRoot(ctx: any, root: any, viewerUserId: any, cache: PostCardReadCache): Promise<PostCard | null> {
  if (root?.cardKind === "poll") {
    const poll = await ctx.db.query("communityInteractionPolls").withIndex("by_root", (q: any) => q.eq("rootId", root._id)).first();
    return poll ? await readPollCard(ctx, poll, viewerUserId, cache) : null;
  }
  if (root?.cardKind === "form") {
    const share = await ctx.db.query("communityInteractionFormShares").withIndex("by_root", (q: any) => q.eq("rootId", root._id)).first();
    return share ? await readFormCard(ctx, share, viewerUserId, cache) : null;
  }
  return null;
}
