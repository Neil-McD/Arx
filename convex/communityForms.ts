import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireCommunityManager, resolveUserIdForAuthenticatedRequest } from "./communityCore";
import { communityFormQuestionValidator } from "./communityFormValidators";
import { COMMUNITY_FORM_MAX_FORMS, communityFormIssue } from "../shared/communityForms";

const scope = { communityId: v.id("communities"), authSubject: v.optional(v.string()) };
async function manager(ctx: any, args: any) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
  await requireCommunityManager({ ctx, communityId: args.communityId, userId });
  return userId;
}
const project = (row: any) => ({ key: row.key, name: row.name, questions: row.questions,
  revision: row.revision, publishedRevision: row.publishedRevision ?? null });

export const listBuilderForms = query({ args: scope, handler: async (ctx, args) => {
  await manager(ctx, args);
  return (await ctx.db.query("communityForms").withIndex("by_community_key", q => q.eq("communityId", args.communityId))
    .take(COMMUNITY_FORM_MAX_FORMS)).map(project);
} });

export const saveBuilderForm = mutation({
  args: { ...scope, key: v.string(), expectedRevision: v.number(), name: v.string(), questions: v.array(communityFormQuestionValidator) },
  handler: async (ctx, args) => {
    await manager(ctx, args);
    if (!args.key || args.key.length > 80) throw new Error("form_key_invalid");
    const issue = communityFormIssue(args); if (issue) throw new Error(issue);
    const row = await ctx.db.query("communityForms").withIndex("by_community_key", q => q.eq("communityId", args.communityId).eq("key", args.key)).unique();
    const unchanged = row && row.name === args.name && JSON.stringify(row.questions) === JSON.stringify(args.questions);
    // Exact retry is a no-op, including a create whose response was lost.
    if (unchanged) return project(row);
    if ((row?.revision ?? 0) !== args.expectedRevision) throw new Error("form_revision_conflict");
    const now = Date.now();
    const content = { name: args.name, questions: args.questions, revision: (row?.revision ?? 0) + 1, updatedAt: now };
    if (row) { await ctx.db.patch(row._id, content); return project({ ...row, ...content }); }
    const forms = await ctx.db.query("communityForms").withIndex("by_community_key", q => q.eq("communityId", args.communityId)).take(COMMUNITY_FORM_MAX_FORMS);
    if (forms.length >= COMMUNITY_FORM_MAX_FORMS) throw new Error("form_limit_reached");
    await ctx.db.insert("communityForms", { ...content, communityId: args.communityId, key: args.key, createdAt: now });
    return project({ ...content, key: args.key });
  },
});

export const publishBuilderForm = mutation({
  args: { ...scope, key: v.string(), expectedRevision: v.number() },
  handler: async (ctx, args) => {
    const userId = await manager(ctx, args);
    const row = await ctx.db.query("communityForms").withIndex("by_community_key", q => q.eq("communityId", args.communityId).eq("key", args.key)).unique();
    if (!row || row.revision !== args.expectedRevision) throw new Error("form_revision_conflict");
    const issue = communityFormIssue(row, true); if (issue) throw new Error(issue);
    const prior = await ctx.db.query("communityFormVersions").withIndex("by_form_revision", q => q.eq("formId", row._id).eq("revision", row.revision)).unique();
    if (!prior) await ctx.db.insert("communityFormVersions", { communityId: row.communityId, formId: row._id,
      revision: row.revision, name: row.name, questions: row.questions, publishedBy: userId, publishedAt: Date.now() });
    await ctx.db.patch(row._id, { publishedRevision: row.revision });
    return project({ ...row, publishedRevision: row.revision });
  },
});
