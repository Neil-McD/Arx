import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// The record behind Workflows › Recent changes (communityWorkflowChanges.ts).
// Kept apart so the stage save can write it without importing the page's
// queries.

const KEPT_PER_COMMUNITY = 200;

/** A stage as comparable text: same content, same text, whatever the key order. */
export function stageSnapshot(stage: unknown): string {
  const sort = (value: unknown): unknown => Array.isArray(value) ? value.map(sort)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.keys(value as object).sort()
        .filter(key => (value as any)[key] !== undefined).map(key => [key, sort((value as any)[key])]))
      : value;
  return JSON.stringify(sort(stage ?? null));
}

export async function recordWorkflowStageChange(ctx: MutationCtx, change: {
  communityId: Id<"communities">; milestoneKey: string; userId: Id<"users">; revision: number;
  via: "app" | "agent"; changedBy?: string; approvedByUserId?: Id<"users">;
  undoOf?: Id<"communityWorkflowChanges">; before: unknown; after: unknown;
}) {
  // A save that changed nothing isn't a change worth listing.
  if (stageSnapshot(change.before) === stageSnapshot(change.after)) return null;
  const id = await ctx.db.insert("communityWorkflowChanges", {
    communityId: change.communityId, milestoneKey: change.milestoneKey, changedByUserId: change.userId,
    via: change.via, ...(change.changedBy?.trim() ? { changedBy: change.changedBy.trim().slice(0, 60) } : {}),
    ...(change.approvedByUserId ? { approvedByUserId: change.approvedByUserId } : {}),
    ...(change.undoOf ? { undoOf: change.undoOf } : {}),
    before: change.before, after: change.after, revision: change.revision, createdAt: Date.now(),
  });
  const old = await ctx.db.query("communityWorkflowChanges")
    .withIndex("by_community_createdAt", q => q.eq("communityId", change.communityId))
    .order("desc").take(KEPT_PER_COMMUNITY + 5);
  for (const row of old.slice(KEPT_PER_COMMUNITY)) await ctx.db.delete(row._id);
  return id;
}
