import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  type SkillPackageRow,
  mapSkillPackageReadModel,
  normalizeSkillInstructionsMd,
  normalizeSkillPackageDescription,
  normalizeSkillPackageName,
} from "./skillCore";
import { resolveUserIdForAuthenticatedRequest } from "./communityCore";

async function getSkillPackageById(ctx: any, skillPackageId: any): Promise<SkillPackageRow | null> {
  return ((await ctx.db.get(skillPackageId)) as SkillPackageRow | null) ?? null;
}

async function createSkillPackageRow(args: {
  ctx: any;
  ownerUserId: any;
  name: string;
  description?: string;
  instructionsMd: string;
  nowMs?: number;
}): Promise<any> {
  const nowMs = args.nowMs ?? Date.now();
  const name = normalizeSkillPackageName(args.name);
  if (!name) throw new Error("skill_package_name_required");
  const description = normalizeSkillPackageDescription(args.description);
  const instructionsMd = normalizeSkillInstructionsMd(args.instructionsMd);
  if (!instructionsMd) throw new Error("skill_package_instructions_required");
  return await args.ctx.db.insert("skillPackages", {
    ownerUserId: args.ownerUserId,
    name,
    description: description || undefined,
    instructionsMd,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
}

export const getSkillPackageByIdInternal = internalQuery({
  args: {
    skillPackageId: v.id("skillPackages"),
  },
  handler: async (ctx, args) => {
    return await getSkillPackageById(ctx, args.skillPackageId);
  },
});

export const listOwnedSkillPackages = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const rows = (await ctx.db
      .query("skillPackages")
      .withIndex("by_owner", (q: any) => q.eq("ownerUserId", userId))
      .collect()) as SkillPackageRow[];
    return rows.map((row) => mapSkillPackageReadModel(row));
  },
});

export const createSkillPackage = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    name: v.string(),
    description: v.optional(v.string()),
    instructionsMd: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const skillPackageId = await createSkillPackageRow({
      ctx,
      ownerUserId: userId,
      name: args.name,
      description: args.description,
      instructionsMd: args.instructionsMd,
      nowMs: args.nowMs,
    });
    const skill = await getSkillPackageById(ctx, skillPackageId);
    if (!skill) throw new Error("skill_package_not_found");
    return mapSkillPackageReadModel(skill);
  },
});

export const createSkillPackageInternal = internalMutation({
  args: {
    ownerUserId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    instructionsMd: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await createSkillPackageRow({
      ctx,
      ownerUserId: args.ownerUserId,
      name: args.name,
      description: args.description,
      instructionsMd: args.instructionsMd,
      nowMs: args.nowMs,
    });
  },
});

export const deleteSkillPackageCascadeInternal = internalMutation({
  args: {
    skillPackageId: v.id("skillPackages"),
  },
  handler: async (ctx, args) => {
    const skillPackage = await getSkillPackageById(ctx, args.skillPackageId);
    if (!skillPackage) return { deleted: false };

    const attachmentRows = (await ctx.db
      .query("communitySkillAttachments")
      .withIndex("by_skill", (q: any) => q.eq("skillPackageId", args.skillPackageId))
      .collect()) as Array<{ _id: any }>;
    for (const row of attachmentRows) {
      await ctx.db.delete(row._id);
    }

    await ctx.db.delete(skillPackage._id);
    return { deleted: true };
  },
});
