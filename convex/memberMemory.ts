// Personal memory & Soul (shared/personalMemory.ts, shared/agentSoul.ts):
// Stores both what the guide remembers about one member in one community AND
// that member's evolving personal Soul with the guide. Strictly scoped to
// (communityId, userId): only that signed-in member can read or edit it.
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireCommunityChatAccess, resolveUserIdForAuthenticatedRequest } from "./communityCore";
import { readUserGlobalGuideSettings } from "./userGuideSettings";
import {
  AGENT_SOUL_MAX_CHARS,
  DEFAULT_PERSONAL_SOUL_MD,
  cleanAgentSoulText,
  validateAgentSoulWrite,
} from "../shared/agentSoul";
import {
  PERSONAL_MEMORY_ENTRY_MAX_CHARS,
  PERSONAL_MEMORY_MAX_CHARS,
  applyPersonalMemoryOperations,
  normalizePersonalMemoryCategory,
  parsePersonalMemoryOperations,
  personalMemoryChars,
  renderPersonalMemory,
  type PersonalMemoryCategory,
  type PersonalMemoryEntry,
} from "../shared/personalMemory";

async function row(ctx: any, communityId: any, userId: any) {
  return await ctx.db
    .query("memberMemories")
    .withIndex("by_community_user", (q: any) =>
      q.eq("communityId", communityId).eq("userId", userId),
    )
    .first();
}

export const readMemberMemoryInternal = internalQuery({
  args: { communityId: v.id("communities"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const entries: PersonalMemoryEntry[] = (await row(ctx, args.communityId, args.userId))?.entries ?? [];
    return {
      body: renderPersonalMemory(entries),
      entries: entries.length,
      chars: personalMemoryChars(entries),
    };
  },
});

export const readMemberSoulInternal = internalQuery({
  args: { communityId: v.id("communities"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const [current, globalPrefs] = await Promise.all([
      row(ctx, args.communityId, args.userId),
      readUserGlobalGuideSettings(ctx, args.userId),
    ]);
    const communityCustom = cleanAgentSoulText(current?.soulMd);
    const globalCustom = cleanAgentSoulText(globalPrefs?.soulMd);
    if (communityCustom) {
      return {
        body: communityCustom,
        isDefault: false,
        updatedAt: current?.soulUpdatedAt ?? null,
        updatedBy: current?.soulUpdatedBy ?? null,
      };
    }
    if (globalCustom) {
      return {
        body: globalCustom,
        isDefault: false,
        updatedAt: globalPrefs?.soulUpdatedAt ?? null,
        updatedBy: "member" as const,
      };
    }
    return {
      body: DEFAULT_PERSONAL_SOUL_MD,
      isDefault: true,
      updatedAt: current?.soulUpdatedAt ?? null,
      updatedBy: current?.soulUpdatedBy ?? null,
    };
  },
});

// One batch from the member's own private talk. The turn it came from must
// be this member's own run in this community; the write keeps it as the
// entry's source.
export const rememberForMemberInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    userId: v.id("users"),
    runId: v.string(),
    operationKey: v.string(),
    operations: v.any(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("runtimeRuns")
      .withIndex("by_owner_runId", (q) => q.eq("ownerId", args.userId).eq("runId", args.runId))
      .first();
    if (!run || String(run.communityId ?? "") !== String(args.communityId)) {
      return {
        ok: false as const,
        code: "private_talk_required",
        message: "Personal memory is written only from the member's own private talk with the guide.",
      };
    }
    const operations = parsePersonalMemoryOperations(args.operations);
    if (!Array.isArray(operations)) return { ok: false as const, ...operations };
    const current = await row(ctx, args.communityId, args.userId);
    const entries: PersonalMemoryEntry[] = current?.entries ?? [];
    // A retry of the last write answers with what it left, without applying again.
    if (current?.lastOperationKey === args.operationKey) {
      return {
        ok: true as const,
        changed: false,
        entries: entries.map((entry) => entry.text),
        usage: `${personalMemoryChars(entries)}/${PERSONAL_MEMORY_MAX_CHARS}`,
      };
    }
    const applied = applyPersonalMemoryOperations(entries, operations, {
      sourceRef: `run:${args.runId}`,
      at: args.nowMs,
    });
    if ("code" in applied) {
      return {
        ok: false as const,
        ...applied,
        current_entries: entries.map((entry) => entry.text),
        usage: `${personalMemoryChars(entries)}/${PERSONAL_MEMORY_MAX_CHARS}`,
      };
    }
    if (current) {
      await ctx.db.patch(current._id, {
        entries: applied.entries,
        lastOperationKey: args.operationKey,
        updatedAt: args.nowMs,
      });
    } else {
      await ctx.db.insert("memberMemories", {
        communityId: args.communityId,
        userId: args.userId,
        entries: applied.entries,
        lastOperationKey: args.operationKey,
        updatedAt: args.nowMs,
      });
    }
    return {
      ok: true as const,
      changed: applied.changed,
      entries: applied.entries.map((entry) => entry.text),
      usage: `${personalMemoryChars(applied.entries)}/${PERSONAL_MEMORY_MAX_CHARS}`,
    };
  },
});

// Autonomous Personal Soul refinement from the member's own private talk.
export const updateMemberSoulInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    userId: v.id("users"),
    runId: v.string(),
    operationKey: v.string(),
    soulMd: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("runtimeRuns")
      .withIndex("by_owner_runId", (q) => q.eq("ownerId", args.userId).eq("runId", args.runId))
      .first();
    if (!run || String(run.communityId ?? "") !== String(args.communityId)) {
      return {
        ok: false as const,
        code: "private_talk_required",
        message: "Personal soul is refined only from the member's own private talk with the guide.",
      };
    }
    const validated = validateAgentSoulWrite(args.soulMd);
    if (!validated.ok) return validated;
    const current = await row(ctx, args.communityId, args.userId);
    if (current?.lastSoulOperationKey === args.operationKey) {
      const existing = cleanAgentSoulText(current.soulMd) || DEFAULT_PERSONAL_SOUL_MD;
      return {
        ok: true as const,
        changed: false,
        soul: existing,
        usage: `${existing.length}/${AGENT_SOUL_MAX_CHARS}`,
      };
    }
    const changed = cleanAgentSoulText(current?.soulMd) !== validated.soulMd;
    if (current) {
      await ctx.db.patch(current._id, {
        soulMd: validated.soulMd,
        soulUpdatedAt: args.nowMs,
        soulUpdatedBy: "guide",
        lastSoulOperationKey: args.operationKey,
        updatedAt: args.nowMs,
      });
    } else {
      await ctx.db.insert("memberMemories", {
        communityId: args.communityId,
        userId: args.userId,
        entries: [],
        soulMd: validated.soulMd,
        soulUpdatedAt: args.nowMs,
        soulUpdatedBy: "guide",
        lastSoulOperationKey: args.operationKey,
        updatedAt: args.nowMs,
      });
    }
    return {
      ok: true as const,
      changed,
      soul: validated.soulMd,
      usage: `${validated.soulMd.length}/${AGENT_SOUL_MAX_CHARS}`,
    };
  },
});

function buildMemberSoulMemoryView(current: any, globalPrefs?: { soulMd?: string; soulUpdatedAt?: number } | null) {
  const entries: PersonalMemoryEntry[] = current?.entries ?? [];
  const communityCustom = cleanAgentSoulText(current?.soulMd);
  const globalCustom = cleanAgentSoulText(globalPrefs?.soulMd);
  const effectiveSoul = communityCustom || globalCustom || DEFAULT_PERSONAL_SOUL_MD;
  const usingCommunityOverride = Boolean(communityCustom);
  return {
    soul_md: effectiveSoul,
    soul_is_default: !usingCommunityOverride,
    soul_updated_at: usingCommunityOverride
      ? (current?.soulUpdatedAt ?? null)
      : (globalCustom ? (globalPrefs?.soulUpdatedAt ?? null) : (current?.soulUpdatedAt ?? null)),
    soul_updated_by: usingCommunityOverride
      ? (current?.soulUpdatedBy ?? null)
      : (globalCustom ? "member" : (current?.soulUpdatedBy ?? null)),
    soul_max_chars: AGENT_SOUL_MAX_CHARS,
    entries: entries.map((entry) => ({
      text: entry.text,
      category: (entry.category ?? "fact") as PersonalMemoryCategory,
      at: entry.at,
    })),
    memory_chars: personalMemoryChars(entries),
    memory_max_chars: PERSONAL_MEMORY_MAX_CHARS,
    memory_updated_at: entries.length > 0 ? (current?.updatedAt ?? null) : null,
  };
}

// Self-service Settings -> Membership cards: strictly the signed-in member's own
// private Soul & Memory in this community. Never readable by anyone else.
export const getMyGuideSoulAndMemory = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const [current, globalPrefs] = await Promise.all([
      row(ctx, args.communityId, userId),
      readUserGlobalGuideSettings(ctx, userId),
    ]);
    return buildMemberSoulMemoryView(current, globalPrefs);
  },
});

export const saveMyGuideSoul = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    // null resets back to the default starter Soul.
    soulMd: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const nowMs = Date.now();
    const current = await row(ctx, args.communityId, userId);
    if (args.soulMd === null) {
      if (current) {
        await ctx.db.patch(current._id, {
          soulMd: undefined,
          soulUpdatedAt: nowMs,
          soulUpdatedBy: "member",
          updatedAt: nowMs,
        });
      }
      const [updated, globalPrefs] = await Promise.all([
        row(ctx, args.communityId, userId),
        readUserGlobalGuideSettings(ctx, userId),
      ]);
      return buildMemberSoulMemoryView(updated, globalPrefs);
    }
    const validated = validateAgentSoulWrite(args.soulMd);
    if (!validated.ok) throw new Error(validated.code);
    if (current) {
      await ctx.db.patch(current._id, {
        soulMd: validated.soulMd,
        soulUpdatedAt: nowMs,
        soulUpdatedBy: "member",
        updatedAt: nowMs,
      });
    } else {
      await ctx.db.insert("memberMemories", {
        communityId: args.communityId,
        userId,
        entries: [],
        soulMd: validated.soulMd,
        soulUpdatedAt: nowMs,
        soulUpdatedBy: "member",
        updatedAt: nowMs,
      });
    }
    const [updated, globalPrefs] = await Promise.all([
      row(ctx, args.communityId, userId),
      readUserGlobalGuideSettings(ctx, userId),
    ]);
    return buildMemberSoulMemoryView(updated, globalPrefs);
  },
});

export const saveMyGuideMemory = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    // Atomic single-item operations apply against the latest stored row so
    // concurrent guide updates in another tab are never overwritten.
    operation: v.optional(
      v.union(
        v.object({
          action: v.literal("add"),
          text: v.string(),
          category: v.optional(
            v.union(v.literal("fact"), v.literal("preference"), v.literal("commitment")),
          ),
        }),
        v.object({
          action: v.literal("remove"),
          text: v.string(),
        }),
        v.object({
          action: v.literal("clear"),
        }),
      ),
    ),
    // Optional full-snapshot replacement (guarded by expectedUpdatedAt when provided).
    entries: v.optional(
      v.array(
        v.object({
          text: v.string(),
          category: v.optional(
            v.union(v.literal("fact"), v.literal("preference"), v.literal("commitment")),
          ),
        }),
      ),
    ),
    expectedUpdatedAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const nowMs = Date.now();
    const current = await row(ctx, args.communityId, userId);

    let cleaned: PersonalMemoryEntry[];
    if (args.operation) {
      const existing: PersonalMemoryEntry[] = [...(current?.entries ?? [])];
      if (args.operation.action === "clear") {
        cleaned = [];
      } else if (args.operation.action === "remove") {
        const target = cleanAgentSoulText(args.operation.text).replace(/\s+/g, " ");
        cleaned = existing.filter((entry) => entry.text !== target);
      } else {
        const text = cleanAgentSoulText(args.operation.text).replace(/\s+/g, " ");
        if (!text) throw new Error("entry_empty");
        if (text.length > PERSONAL_MEMORY_ENTRY_MAX_CHARS) throw new Error("entry_too_long");
        const category = normalizePersonalMemoryCategory(args.operation.category) ?? "fact";
        cleaned = existing.some((entry) => entry.text === text)
          ? existing
          : [...existing, { text, category, sourceRef: "member:settings", at: nowMs }];
      }
    } else {
      const currentUpdatedAt = current?.updatedAt ?? null;
      if (args.expectedUpdatedAt !== undefined && args.expectedUpdatedAt !== currentUpdatedAt) {
        throw new Error("memory_stale");
      }
      cleaned = [];
      const seen = new Set<string>();
      for (const item of args.entries ?? []) {
        const text = cleanAgentSoulText(item.text).replace(/\s+/g, " ");
        if (!text) continue;
        if (text.length > PERSONAL_MEMORY_ENTRY_MAX_CHARS) throw new Error("entry_too_long");
        if (seen.has(text)) continue;
        seen.add(text);
        const category = normalizePersonalMemoryCategory(item.category) ?? "fact";
        cleaned.push({ text, category, sourceRef: "member:settings", at: nowMs });
      }
    }
    if (personalMemoryChars(cleaned) > PERSONAL_MEMORY_MAX_CHARS) {
      throw new Error("memory_full");
    }
    if (current) {
      await ctx.db.patch(current._id, { entries: cleaned, updatedAt: nowMs });
    } else if (cleaned.length > 0) {
      await ctx.db.insert("memberMemories", {
        communityId: args.communityId,
        userId,
        entries: cleaned,
        updatedAt: nowMs,
      });
    }
    const [updated, globalPrefs] = await Promise.all([
      row(ctx, args.communityId, userId),
      readUserGlobalGuideSettings(ctx, userId),
    ]);
    return buildMemberSoulMemoryView(updated, globalPrefs);
  },
});
