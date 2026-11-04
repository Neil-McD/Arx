// Lesson progress: which lessons a member has marked done. Private to that
// member: only reads made for them (their site, their MCP harness, their Ask)
// see it, and only the member's own tools change it (community.lesson.set_done).
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
  normalizeIdValue,
  requireCommunityChatAccess,
} from "./communityCore";

const MAX_REFS_PER_READ = 200;

function lessonIdFromRef(ctx: any, ref: string) {
  const match = /^resource:([A-Za-z0-9]+)$/.exec(String(ref ?? "").trim());
  return match ? ctx.db.normalizeId("communityResources", match[1]) : null;
}

// A lesson the member can mark: a live page in a live course of this community.
async function liveLesson(ctx: any, communityId: any, resourceId: any) {
  const lesson = await ctx.db.get(resourceId);
  if (!lesson || normalizeIdValue(lesson.communityId) !== normalizeIdValue(communityId) || !lesson.moduleId) return null;
  const module = await ctx.db.get(lesson.moduleId);
  if (!module || !communityResourceModuleIsLive(module)) return null;
  return communityResourceIsLiveModulePage(lesson, new Set([normalizeIdValue(module._id)])) ? lesson : null;
}

export const setLessonDoneInternal = internalMutation({
  args: { communityId: v.id("communities"), userId: v.id("users"), ref: v.string(), done: v.boolean() },
  handler: async (ctx, args) => {
    // Checked again here, in the write's own transaction: access revoked since
    // the door authorized the call stops the write.
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: args.userId });
    const resourceId = lessonIdFromRef(ctx, args.ref);
    if (!resourceId || !(await liveLesson(ctx, args.communityId, resourceId))) {
      return { ok: false as const, code: "lesson_not_found", message: "That lesson isn't available. List a course under resources/ for its lessons." };
    }
    const existing = await ctx.db.query("communityLessonProgress")
      .withIndex("by_user_resource", (q) => q.eq("userId", args.userId).eq("resourceId", resourceId)).first();
    // Setting (not toggling) makes a retry safe without a receipt.
    if (args.done && !existing) {
      await ctx.db.insert("communityLessonProgress", { communityId: args.communityId, userId: args.userId, resourceId, completedAt: Date.now() });
    } else if (!args.done && existing) {
      await ctx.db.delete(existing._id);
    }
    return { ok: true as const, ref: args.ref, done: args.done };
  },
});

// Which of these lesson refs the member has marked done.
export const doneLessonRefsInternal = internalQuery({
  args: { userId: v.id("users"), refs: v.array(v.string()) },
  handler: async (ctx, args) => {
    const done: string[] = [];
    for (const ref of args.refs.slice(0, MAX_REFS_PER_READ)) {
      const resourceId = lessonIdFromRef(ctx, ref);
      if (!resourceId) continue;
      const row = await ctx.db.query("communityLessonProgress")
        .withIndex("by_user_resource", (q) => q.eq("userId", args.userId).eq("resourceId", resourceId)).first();
      if (row) done.push(ref);
    }
    return done;
  },
});
