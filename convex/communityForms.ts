import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireCommunityManager, resolveUserIdForAuthenticatedRequest } from "./communityCore";
import { communityFormQuestionValidator } from "./communityFormValidators";
import { COMMUNITY_FORM_MAX_FORMS, communityFormIssue, type CommunityFormUse } from "../shared/communityForms";
import { communityClientPropertyAcceptsQuestion, communityClientUnmatchedOptions } from "../shared/communityClients";
import { getCommunityMemberWorkflowByCommunity } from "./communityMemberWorkflowReadCore";

const scope = { communityId: v.id("communities"), authSubject: v.optional(v.string()) };
async function manager(ctx: any, args: any) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
  await requireCommunityManager({ ctx, communityId: args.communityId, userId });
  return userId;
}
const project = (row: any, usedIn?: CommunityFormUse[]) => ({ key: row.key, name: row.name, questions: row.questions,
  revision: row.revision, publishedRevision: row.publishedRevision ?? null,
  ...(usedIn ? { usedIn } : {}), ...(row.deletedAt ? { deletedAt: row.deletedAt } : {}) });

async function formUses(ctx: any, communityId: any): Promise<Map<string, CommunityFormUse[]>> {
  const uses = new Map<string, CommunityFormUse[]>();
  const add = (key: string, use: CommunityFormUse) => uses.set(key, [...(uses.get(key) ?? []), use]);
  const workflow: any = await getCommunityMemberWorkflowByCommunity({ ctx, communityId });
  for (const stage of workflow?.milestones ?? []) {
    for (const [rules, paused] of [[stage.automations ?? [], false], [stage.pausedAutomations ?? [], true]] as const) {
      for (const rule of rules as any[]) {
        const base = { kind: "automation" as const, stageKey: stage.key, stageName: stage.name, automationKey: rule.key, paused };
        if (rule.action?.type === "request_form") add(rule.action.formKey, { ...base, role: "sends" });
        if (rule.trigger?.type === "form_submitted") add(rule.trigger.formKey, { ...base, role: "starts" });
      }
    }
  }
  for (const block of workflow?.welcomePage?.layout ?? []) if (block.type === "form") add(block.formKey, { kind: "welcome_page" });
  return uses;
}

const byPosition = (a: any, b: any) => (a.position ?? a.createdAt) - (b.position ?? b.createdAt) || a.createdAt - b.createdAt;
async function communityFormRows(ctx: any, communityId: any) {
  return (await ctx.db.query("communityForms").withIndex("by_community_key", (q: any) => q.eq("communityId", communityId))
    .take(COMMUNITY_FORM_MAX_FORMS)).sort(byPosition);
}

// A mapped question must point at a live property that can hold every answer it allows:
// the right type, and for choices, options the property has.
async function requireFillableMappings(ctx: any, communityId: any, questions: Array<{ type: string; options: string[]; clientPropertyKey?: string }>) {
  for (const question of questions) {
    if (!question.clientPropertyKey) continue;
    const property = await ctx.db.query("communityClientProperties")
      .withIndex("by_community_key", (q: any) => q.eq("communityId", communityId).eq("key", question.clientPropertyKey!)).unique();
    if (!property || property.archivedAt) throw new Error("client_property_not_found");
    if (!communityClientPropertyAcceptsQuestion(property.type, question.type)) throw new Error("form_property_type_mismatch");
    if (communityClientUnmatchedOptions(property, question).length) throw new Error("form_property_options_mismatch");
  }
}

export const listBuilderForms = query({ args: scope, handler: async (ctx, args) => {
  await manager(ctx, args);
  const uses = await formUses(ctx, args.communityId);
  return (await communityFormRows(ctx, args.communityId)).filter((row: any) => !row.deletedAt)
    .map((row: any) => project(row, uses.get(row.key) ?? []));
} });

export const listDeletedBuilderForms = query({ args: scope, handler: async (ctx, args) => {
  await manager(ctx, args);
  return (await communityFormRows(ctx, args.communityId)).filter((row: any) => row.deletedAt).map((row: any) => project(row));
} });

/** The new order of the Forms list; forms left out keep their place after the ones named. */
export const reorderBuilderForms = mutation({
  args: { ...scope, keys: v.array(v.string()) },
  handler: async (ctx, args) => {
    await manager(ctx, args);
    const rows = (await communityFormRows(ctx, args.communityId)).filter((row: any) => !row.deletedAt);
    const named = args.keys.flatMap((key) => rows.filter((row: any) => row.key === key));
    if (new Set(args.keys).size !== args.keys.length || named.length !== args.keys.length) throw new Error("form_not_found");
    const ordered = [...named, ...rows.filter((row: any) => !args.keys.includes(row.key))];
    for (const [index, row] of ordered.entries()) if (row.position !== index) await ctx.db.patch(row._id, { position: index });
    return { keys: ordered.map((row: any) => row.key) };
  },
});

/** A form in use can't be deleted: take it out of every automation and the Welcome page first. */
export const deleteBuilderForm = mutation({
  args: { ...scope, key: v.string() },
  handler: async (ctx, args) => {
    await manager(ctx, args);
    const row = await ctx.db.query("communityForms").withIndex("by_community_key", q => q.eq("communityId", args.communityId).eq("key", args.key)).unique();
    if (!row) throw new Error("form_not_found");
    if (row.deletedAt) return project(row);
    if ((await formUses(ctx, args.communityId)).get(args.key)?.length) throw new Error("form_in_use");
    const now = Date.now();
    await ctx.db.patch(row._id, { deletedAt: now, updatedAt: now });
    return project({ ...row, deletedAt: now });
  },
});

export const restoreBuilderForm = mutation({
  args: { ...scope, key: v.string() },
  handler: async (ctx, args) => {
    await manager(ctx, args);
    const row = await ctx.db.query("communityForms").withIndex("by_community_key", q => q.eq("communityId", args.communityId).eq("key", args.key)).unique();
    if (!row) throw new Error("form_not_found");
    if (row.deletedAt) await ctx.db.patch(row._id, { deletedAt: undefined, updatedAt: Date.now() });
    return project({ ...row, deletedAt: undefined }, []);
  },
});

export const saveBuilderForm = mutation({
  args: { ...scope, key: v.string(), expectedRevision: v.number(), name: v.string(), questions: v.array(communityFormQuestionValidator) },
  handler: async (ctx, args) => {
    await manager(ctx, args);
    if (!args.key || args.key.length > 80) throw new Error("form_key_invalid");
    const issue = communityFormIssue(args); if (issue) throw new Error(issue);
    await requireFillableMappings(ctx, args.communityId, args.questions);
    const row = await ctx.db.query("communityForms").withIndex("by_community_key", q => q.eq("communityId", args.communityId).eq("key", args.key)).unique();
    const unchanged = row && row.name === args.name && JSON.stringify(row.questions) === JSON.stringify(args.questions);
    // Exact retry is a no-op, including a create whose response was lost.
    if (row?.deletedAt) throw new Error("form_deleted");
    if (unchanged) return project(row);
    if ((row?.revision ?? 0) !== args.expectedRevision) throw new Error("form_revision_conflict");
    const now = Date.now();
    const content = { name: args.name, questions: args.questions, revision: (row?.revision ?? 0) + 1, updatedAt: now };
    if (row) { await ctx.db.patch(row._id, content); return project({ ...row, ...content }); }
    const forms = await ctx.db.query("communityForms").withIndex("by_community_key", q => q.eq("communityId", args.communityId)).take(COMMUNITY_FORM_MAX_FORMS);
    if (forms.length >= COMMUNITY_FORM_MAX_FORMS) throw new Error("form_limit_reached");
    const last = forms.reduce((max: number, form: any) => Math.max(max, form.position ?? -1), -1);
    await ctx.db.insert("communityForms", { ...content, communityId: args.communityId, key: args.key, createdAt: now, ...(last >= 0 ? { position: last + 1 } : {}) });
    return project({ ...content, key: args.key });
  },
});

export const publishBuilderForm = mutation({
  args: { ...scope, key: v.string(), expectedRevision: v.number() },
  handler: async (ctx, args) => {
    const userId = await manager(ctx, args);
    const row = await ctx.db.query("communityForms").withIndex("by_community_key", q => q.eq("communityId", args.communityId).eq("key", args.key)).unique();
    if (!row || row.revision !== args.expectedRevision) throw new Error("form_revision_conflict");
    if (row.deletedAt) throw new Error("form_deleted");
    const issue = communityFormIssue(row, true); if (issue) throw new Error(issue);
    // Properties may have changed since the form was saved; publish only mappings that still fill.
    await requireFillableMappings(ctx, row.communityId, row.questions);
    const prior = await ctx.db.query("communityFormVersions").withIndex("by_form_revision", q => q.eq("formId", row._id).eq("revision", row.revision)).unique();
    if (!prior) await ctx.db.insert("communityFormVersions", { communityId: row.communityId, formId: row._id,
      revision: row.revision, name: row.name, questions: row.questions, publishedBy: userId, publishedAt: Date.now() });
    await ctx.db.patch(row._id, { publishedRevision: row.revision });
    return project({ ...row, publishedRevision: row.revision });
  },
});
