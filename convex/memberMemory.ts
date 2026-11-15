// Personal memory (shared/personalMemory.ts): the store behind
// members/me/memory.md and member.memory.remember. Only the canonical
// executor calls these, for the member who is signed in; whose memory it is
// never comes from the model.
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  applyPersonalMemoryOperations,
  parsePersonalMemoryOperations,
  personalMemoryChars,
  PERSONAL_MEMORY_MAX_CHARS,
  renderPersonalMemory,
  type PersonalMemoryEntry,
} from "../shared/personalMemory";

async function row(ctx: any, communityId: any, userId: any) {
  return await ctx.db.query("memberMemories")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId)).first();
}

export const readMemberMemoryInternal = internalQuery({
  args: { communityId: v.id("communities"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const entries: PersonalMemoryEntry[] = (await row(ctx, args.communityId, args.userId))?.entries ?? [];
    return { body: renderPersonalMemory(entries), entries: entries.length, chars: personalMemoryChars(entries) };
  },
});

// One batch from the member's own private talk. The turn it came from must
// be this member's own run in this community; the write keeps it as the
// entry's source.
export const rememberForMemberInternal = internalMutation({
  args: { communityId: v.id("communities"), userId: v.id("users"), runId: v.string(), operations: v.any(), nowMs: v.number() },
  handler: async (ctx, args) => {
    const run = await ctx.db.query("runtimeRuns")
      .withIndex("by_owner_runId", (q) => q.eq("ownerId", args.userId).eq("runId", args.runId)).first();
    if (!run || String(run.communityId ?? "") !== String(args.communityId)) {
      return { ok: false as const, code: "private_talk_required", message: "Personal memory is written only from the member's own private talk with the guide." };
    }
    const operations = parsePersonalMemoryOperations(args.operations);
    if (!Array.isArray(operations)) return { ok: false as const, ...operations };
    const current = await row(ctx, args.communityId, args.userId);
    const entries: PersonalMemoryEntry[] = current?.entries ?? [];
    const applied = applyPersonalMemoryOperations(entries, operations, { sourceRef: `run:${args.runId}`, at: args.nowMs });
    if ("code" in applied) {
      return { ok: false as const, ...applied, current_entries: entries.map((entry) => entry.text), usage: `${personalMemoryChars(entries)}/${PERSONAL_MEMORY_MAX_CHARS}` };
    }
    if (applied.changed) {
      if (current) await ctx.db.patch(current._id, { entries: applied.entries, updatedAt: args.nowMs });
      else await ctx.db.insert("memberMemories", { communityId: args.communityId, userId: args.userId, entries: applied.entries, updatedAt: args.nowMs });
    }
    return {
      ok: true as const,
      changed: applied.changed,
      entries: applied.entries.map((entry) => entry.text),
      usage: `${personalMemoryChars(applied.entries)}/${PERSONAL_MEMORY_MAX_CHARS}`,
    };
  },
});
