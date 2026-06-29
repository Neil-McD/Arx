import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityChatMessageLike,
  type CommunityChatThreadLike,
  normalizeIdValue,
} from "./communityCore";

type InteractionRootRow = {
  _id: any;
  communityId: any;
  replyCount: number;
  idempotencyKey: string;
};

type InteractionReplyRow = {
  _id: any;
  rootId: any;
  seq: number;
};

type NormalizedContentBlock = {
  blockType: "markdown_text";
  text: string;
};

const SEED_AUTH_PREFIX = "seed:polynet:";

const SEED_PEOPLE = [
  { key: "agent", name: "Polynet Agent", handle: "polynet-agent" },
  { key: "maya", name: "Maya Chen", handle: "mayac" },
  { key: "dev", name: "Dev Patel", handle: "devp" },
  { key: "aimen", name: "Aimen Babaci", handle: "aimenb" },
  { key: "sofia", name: "Sofia Rossi", handle: "sofiar" },
  { key: "justin", name: "Justin Park", handle: "justinp" },
] as const;

function contentSummary(blocks: NormalizedContentBlock[]): string {
  const summary = blocks
    .map((block) => block.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  if (!summary) throw new Error("interaction_content_required");
  return summary;
}

async function ensureLegacyCompatibilityChatThread(
  ctx: any,
  communityId: any,
  nowMs: number,
): Promise<CommunityChatThreadLike> {
  const existing = (await ctx.db
    .query("communityChatThreads" as any)
    .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId))
    .order("asc")
    .first()) as CommunityChatThreadLike | null;
  if (existing) return existing;
  const threadId = await ctx.db.insert("communityChatThreads" as any, {
    communityId,
    lastSeq: 0,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  const thread = (await ctx.db.get(threadId as any)) as CommunityChatThreadLike | null;
  if (!thread) throw new Error("community_chat_thread_create_failed");
  return thread;
}

async function createLegacyCompatibilityChatMessage(args: {
  ctx: any;
  thread: CommunityChatThreadLike;
  actorUserId: any;
  text: string;
  nowMs: number;
}): Promise<CommunityChatMessageLike> {
  const seq = Math.max(0, Math.floor(args.thread.lastSeq ?? 0)) + 1;
  const messageId = await args.ctx.db.insert("communityChatMessages" as any, {
    threadId: args.thread._id,
    seq,
    role: "user",
    contentJson: { text: args.text },
    senderUserId: args.actorUserId,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  await args.ctx.db.patch(args.thread._id as any, { lastSeq: seq, updatedAt: args.nowMs });
  const message = (await args.ctx.db.get(messageId as any)) as CommunityChatMessageLike | null;
  if (!message) throw new Error("community_chat_message_create_failed");
  return message;
}

async function insertContentBlocksForTarget(args: {
  ctx: any;
  communityId: any;
  rootId?: any;
  replyId?: any;
  blocks: NormalizedContentBlock[];
  nowMs: number;
}) {
  for (let index = 0; index < args.blocks.length; index += 1) {
    const block = args.blocks[index]!;
    await args.ctx.db.insert("communityInteractionContentBlocks" as any, {
      communityId: args.communityId,
      ...(args.rootId ? { rootId: args.rootId } : {}),
      ...(args.replyId ? { replyId: args.replyId } : {}),
      blockOrder: index,
      blockType: block.blockType,
      text: block.text,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
  }
}

async function getExistingRootByIdempotencyKey(ctx: any, communityId: any, idempotencyKey: string) {
  return (await ctx.db
    .query("communityInteractionRoots" as any)
    .withIndex("by_community_idempotencyKey", (q: any) =>
      q.eq("communityId", communityId).eq("idempotencyKey", idempotencyKey),
    )
    .first()) as InteractionRootRow | null;
}

async function getExistingReplyByIdempotencyKey(ctx: any, communityId: any, idempotencyKey: string) {
  return (await ctx.db
    .query("communityInteractionReplies" as any)
    .withIndex("by_community_idempotencyKey", (q: any) =>
      q.eq("communityId", communityId).eq("idempotencyKey", idempotencyKey),
    )
    .first()) as InteractionReplyRow | null;
}

async function insertLegacyChatLinkIfMissing(args: {
  ctx: any;
  communityId: any;
  threadId: any;
  messageId: any;
  linkKind: "root" | "reply";
  rootId?: any;
  replyId?: any;
  nowMs: number;
}) {
  const existing = await args.ctx.db
    .query("communityInteractionLegacyChatLinks" as any)
    .withIndex("by_message", (q: any) => q.eq("messageId", args.messageId))
    .first();
  if (existing) return;
  await args.ctx.db.insert("communityInteractionLegacyChatLinks" as any, {
    communityId: args.communityId,
    threadId: args.threadId,
    messageId: args.messageId,
    linkKind: args.linkKind,
    ...(args.rootId ? { rootId: args.rootId } : {}),
    ...(args.replyId ? { replyId: args.replyId } : {}),
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
}

async function nextReplySeq(ctx: any, rootId: any): Promise<number> {
  const last = (await ctx.db
    .query("communityInteractionReplies" as any)
    .withIndex("by_root_seq", (q: any) => q.eq("rootId", rootId))
    .order("desc")
    .first()) as InteractionReplyRow | null;
  return Math.max(0, Math.floor(last?.seq ?? 0)) + 1;
}

export const seedPolynetChatDemo = internalMutation({
  args: { communityId: v.optional(v.id("communities")) },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const HOUR = 3_600_000;
    const DAY = 86_400_000;

    let communityId: any = args.communityId ?? null;
    if (!communityId) {
      const latestRoot = (await ctx.db
        .query("communityInteractionRoots" as any)
        .order("desc")
        .first()) as InteractionRootRow | null;
      communityId = latestRoot?.communityId ?? null;
    }
    if (!communityId) throw new Error("seed_no_community");
    const community = (await ctx.db.get(communityId)) as any;
    if (!community) throw new Error("seed_community_not_found");

    const userIdByKey: Record<string, any> = { neil: community.ownerId };
    for (const person of SEED_PEOPLE) {
      const authSubject = `${SEED_AUTH_PREFIX}${person.key}`;
      let user = (await ctx.db
        .query("users" as any)
        .withIndex("by_authSubject", (q: any) => q.eq("authSubject", authSubject))
        .first()) as any;
      if (!user) {
        const userId = await ctx.db.insert("users" as any, {
          authSubject,
          displayName: person.name,
          handle: person.handle,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
        user = await ctx.db.get(userId as any);
      }
      userIdByKey[person.key] = user._id;
      const membership = await ctx.db
        .query("communityMemberships" as any)
        .withIndex("by_community_user", (q: any) =>
          q.eq("communityId", communityId).eq("userId", user._id),
        )
        .first();
      if (!membership) {
        await ctx.db.insert("communityMemberships" as any, {
          communityId,
          userId: user._id,
          role: "member",
          accessSource: "free_grant",
          active: true,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
      }
    }

    const thread = await ensureLegacyCompatibilityChatThread(ctx, communityId, nowMs);

    const makeRoot = async (opts: {
      key: string;
      authorKey: string;
      kind: string;
      text: string;
      atMs: number;
      reactions?: Array<{ emoji: string; count: number }>;
    }) => {
      const idempotencyKey = `seed:root:${opts.key}`;
      const existing = await getExistingRootByIdempotencyKey(ctx, communityId, idempotencyKey);
      if (existing) return existing;
      const isAgent = opts.authorKey === "agent";
      const blocks: NormalizedContentBlock[] = [{ blockType: "markdown_text", text: opts.text }];
      const rootId = await ctx.db.insert("communityInteractionRoots" as any, {
        communityId,
        actorType: isAgent ? "community_agent" : "human",
        actorUserId: userIdByKey[opts.authorKey],
        kind: opts.kind,
        status: "live",
        visibilityScope: "community",
        contentSummary: contentSummary(blocks),
        replyCount: 0,
        reactionSummary: opts.reactions ?? [],
        idempotencyKey,
        createdAt: opts.atMs,
        updatedAt: opts.atMs,
      });
      await insertContentBlocksForTarget({
        ctx,
        communityId,
        rootId,
        blocks,
        nowMs: opts.atMs,
      });
      if (!isAgent) {
        const message = await createLegacyCompatibilityChatMessage({
          ctx,
          thread,
          actorUserId: userIdByKey[opts.authorKey],
          text: opts.text,
          nowMs: opts.atMs,
        });
        await insertLegacyChatLinkIfMissing({
          ctx,
          communityId,
          threadId: thread._id,
          messageId: message._id,
          linkKind: "root",
          rootId,
          nowMs: opts.atMs,
        });
      }
      return (await ctx.db.get(rootId as any)) as InteractionRootRow;
    };

    const makeReply = async (opts: {
      key: string;
      rootId: any;
      authorKey: string;
      text: string;
      atMs: number;
      reactions?: Array<{ emoji: string; count: number }>;
    }) => {
      const idempotencyKey = `seed:reply:${opts.key}`;
      const existing = await getExistingReplyByIdempotencyKey(ctx, communityId, idempotencyKey);
      if (existing) return existing;
      const root = (await ctx.db.get(opts.rootId as any)) as InteractionRootRow;
      const blocks: NormalizedContentBlock[] = [{ blockType: "markdown_text", text: opts.text }];
      const seq = await nextReplySeq(ctx, root._id);
      const replyId = await ctx.db.insert("communityInteractionReplies" as any, {
        communityId,
        rootId: opts.rootId,
        seq,
        actorType: "human",
        actorUserId: userIdByKey[opts.authorKey],
        status: "live",
        visibilityScope: "community",
        contentSummary: contentSummary(blocks),
        reactionSummary: opts.reactions ?? [],
        idempotencyKey,
        createdAt: opts.atMs,
        updatedAt: opts.atMs,
      });
      await insertContentBlocksForTarget({
        ctx,
        communityId,
        replyId,
        blocks,
        nowMs: opts.atMs,
      });
      await ctx.db.patch(opts.rootId as any, {
        replyCount: Math.max(0, Math.floor(root.replyCount ?? 0)) + 1,
        lastReplyAt: opts.atMs,
        updatedAt: opts.atMs,
      });
      const message = await createLegacyCompatibilityChatMessage({
        ctx,
        thread,
        actorUserId: userIdByKey[opts.authorKey],
        text: opts.text,
        nowMs: opts.atMs,
      });
      await insertLegacyChatLinkIfMissing({
        ctx,
        communityId,
        threadId: thread._id,
        messageId: message._id,
        linkKind: "reply",
        rootId: opts.rootId,
        replyId,
        nowMs: opts.atMs,
      });
      return replyId;
    };

    await makeRoot({
      key: "welcome",
      authorKey: "neil",
      kind: "announcement",
      text: "Welcome to Polynet 👋 This is the founding room. Drop a quick intro: what are you building, and what should your community's AI agent actually do?",
      atMs: nowMs - (DAY + 6 * HOUR),
      reactions: [{ emoji: "👋", count: 4 }, { emoji: "🔥", count: 2 }],
    });
    await makeRoot({
      key: "maya-intro",
      authorKey: "maya",
      kind: "discussion",
      text: "Hey all! Maya here — I run an online strength-training community (~400 members). I want the agent answering form-check and programming questions so I'm not repeating myself 50x a week.",
      atMs: nowMs - (DAY + 5 * HOUR),
      reactions: [{ emoji: "💪", count: 3 }],
    });
    await makeRoot({
      key: "dev-intro",
      authorKey: "dev",
      kind: "discussion",
      text: "Dev, indie hacker doing AI automation for small agencies. Hoping the agent can triage incoming client questions and route the gnarly ones to me.",
      atMs: nowMs - (DAY + 4.5 * HOUR),
    });
    const sofiaQ = await makeRoot({
      key: "sofia-billing",
      authorKey: "sofia",
      kind: "question",
      text: "Quick one before I migrate my Discord over — how does billing work for the AI? Do I pay for my members' tokens?? 😅",
      atMs: nowMs - (DAY + 4 * HOUR),
    });
    await makeReply({
      key: "sofia-billing-1",
      rootId: sofiaQ._id,
      authorKey: "neil",
      text: "Nope — it's BYOK. Members connect their own OpenAI key or ChatGPT login. You never pay for their tokens.",
      atMs: nowMs - (DAY + 3.8 * HOUR),
      reactions: [{ emoji: "👍", count: 2 }],
    });
    await makeReply({
      key: "sofia-billing-2",
      rootId: sofiaQ._id,
      authorKey: "dev",
      text: "this is the part that sold me honestly. ran the numbers, no way I could eat inference for a free community",
      atMs: nowMs - (DAY + 3.6 * HOUR),
    });
    await makeReply({
      key: "sofia-billing-3",
      rootId: sofiaQ._id,
      authorKey: "sofia",
      text: "ok that's a huge relief, thank you 🙏",
      atMs: nowMs - (DAY + 3.4 * HOUR),
    });
    const aimen = await makeRoot({
      key: "aimen-intro",
      authorKey: "aimen",
      kind: "discussion",
      text: "Aimen — surfactant R&D / manufacturing. Niche, but there's a real community of process chemists who'd kill for a shared knowledge base. Curious how the memory stuff works.",
      atMs: nowMs - 6 * HOUR,
    });
    await makeReply({
      key: "aimen-1",
      rootId: aimen._id,
      authorKey: "neil",
      text: "That's the dream use case honestly. High-signal threads get promoted into the community's memory, so the knowledge compounds instead of scrolling away.",
      atMs: nowMs - 5.7 * HOUR,
    });
    await makeReply({
      key: "aimen-2",
      rootId: aimen._id,
      authorKey: "aimen",
      text: "wait so the agent actually learns from the conversations over time?",
      atMs: nowMs - 5.5 * HOUR,
    });
    await makeReply({
      key: "aimen-3",
      rootId: aimen._id,
      authorKey: "neil",
      text: "yeah — but gated. Nothing enters long-term memory without passing a review step. No hallucinated 'facts' polluting it.",
      atMs: nowMs - 5.3 * HOUR,
    });
    await makeRoot({
      key: "justin-codex",
      authorKey: "justin",
      kind: "discussion",
      text: "just wired Codex into my Polynet workspace and had it scaffold a landing page in ~3 minutes. this is unreal 🤯",
      atMs: nowMs - 3 * HOUR,
      reactions: [{ emoji: "🔥", count: 4 }, { emoji: "🚀", count: 2 }],
    });
    await makeRoot({
      key: "agent-digest",
      authorKey: "agent",
      kind: "agent_signal",
      text: "Daily digest — 3 high-signal threads promoted to community memory: 'How BYOK billing works', 'Memory & the review gate', and 'Codex in your workspace'.",
      atMs: nowMs - 2 * HOUR,
    });
    await makeRoot({
      key: "neil-call",
      authorKey: "neil",
      kind: "announcement",
      text: "First community call this Friday 11am PT — bring what you're building.",
      atMs: nowMs - 1 * HOUR,
    });

    return { ok: true, communityId: normalizeIdValue(communityId) };
  },
});

export const unseedPolynetChatDemo = internalMutation({
  args: { communityId: v.optional(v.id("communities")) },
  handler: async (ctx, args) => {
    let communityId: any = args.communityId ?? null;
    if (!communityId) {
      const latestRoot = (await ctx.db
        .query("communityInteractionRoots" as any)
        .order("desc")
        .first()) as InteractionRootRow | null;
      communityId = latestRoot?.communityId ?? null;
    }
    if (!communityId) return { ok: true, deletedRoots: 0 };

    const deleteByIndex = async (table: string, index: string, field: string, value: any) => {
      const rows = await ctx.db
        .query(table as any)
        .withIndex(index, (q: any) => q.eq(field, value))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    };

    const roots = (await ctx.db
      .query("communityInteractionRoots" as any)
      .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId))
      .collect()) as InteractionRootRow[];
    let deletedRoots = 0;
    for (const root of roots) {
      if (!String(root.idempotencyKey ?? "").startsWith("seed:")) continue;
      const replies = (await ctx.db
        .query("communityInteractionReplies" as any)
        .withIndex("by_root_seq", (q: any) => q.eq("rootId", root._id))
        .collect()) as InteractionReplyRow[];
      for (const reply of replies) {
        await deleteByIndex("communityInteractionContentBlocks", "by_reply_order", "replyId", reply._id);
        const replyLinks = await ctx.db
          .query("communityInteractionLegacyChatLinks" as any)
          .withIndex("by_reply", (q: any) => q.eq("replyId", reply._id))
          .collect();
        for (const link of replyLinks) {
          if (link.messageId) await ctx.db.delete(link.messageId).catch(() => undefined);
          await ctx.db.delete(link._id);
        }
        await ctx.db.delete(reply._id);
      }
      await deleteByIndex("communityInteractionContentBlocks", "by_root_order", "rootId", root._id);
      await deleteByIndex("communityInteractionEmbeds", "by_root", "rootId", root._id);
      await deleteByIndex("communityInteractionMentions", "by_root", "rootId", root._id);
      const rootLinks = await ctx.db
        .query("communityInteractionLegacyChatLinks" as any)
        .withIndex("by_root", (q: any) => q.eq("rootId", root._id))
        .collect();
      for (const link of rootLinks) {
        if (link.messageId) await ctx.db.delete(link.messageId).catch(() => undefined);
        await ctx.db.delete(link._id);
      }
      await ctx.db.delete(root._id);
      deletedRoots += 1;
    }

    for (const person of SEED_PEOPLE) {
      const authSubject = `${SEED_AUTH_PREFIX}${person.key}`;
      const user = (await ctx.db
        .query("users" as any)
        .withIndex("by_authSubject", (q: any) => q.eq("authSubject", authSubject))
        .first()) as any;
      if (!user) continue;
      const memberships = await ctx.db
        .query("communityMemberships" as any)
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .collect();
      for (const m of memberships) await ctx.db.delete(m._id);
      await ctx.db.delete(user._id);
    }

    return { ok: true, deletedRoots };
  },
});
