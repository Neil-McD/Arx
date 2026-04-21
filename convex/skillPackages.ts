import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getSkillPackageActiveInstructionsMd,
  type SkillPackageRevisionRow,
  type SkillPackageRow,
  mapSkillPackageReadModel,
  normalizeSkillInstructionsMd,
  normalizeSkillMentionToken,
  normalizeSkillPackageDescription,
  normalizeSkillPackageName,
  readSkillMentionToken,
} from "./skillCore";
import { resolveUserIdForAuthenticatedRequest } from "./communityCore";

async function getSkillPackageById(ctx: any, skillPackageId: any): Promise<SkillPackageRow | null> {
  return ((await ctx.db.get(skillPackageId)) as SkillPackageRow | null) ?? null;
}

async function requireOwnedSkillPackage(args: {
  ctx: any;
  ownerUserId: any;
  skillPackageId: any;
}): Promise<SkillPackageRow> {
  const row = await getSkillPackageById(args.ctx, args.skillPackageId);
  if (!row || String(row.ownerUserId) !== String(args.ownerUserId)) {
    throw new Error("skill_package_not_found");
  }
  return row;
}

async function listOwnedSkillPackagesRows(ctx: any, ownerUserId: any): Promise<SkillPackageRow[]> {
  const rows = (await ctx.db
    .query("skillPackages")
    .withIndex("by_owner", (q: any) => q.eq("ownerUserId", ownerUserId))
    .collect()) as SkillPackageRow[];
  return rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

async function assertOwnerSkillMentionTokenAvailable(args: {
  ctx: any;
  ownerUserId: any;
  mentionToken: string;
  excludeSkillPackageId?: any;
}): Promise<void> {
  const rows = await listOwnedSkillPackagesRows(args.ctx, args.ownerUserId);
  for (const row of rows) {
    if (String(row._id) === String(args.excludeSkillPackageId ?? "")) continue;
    if (readSkillMentionToken(row) === args.mentionToken) {
      throw new Error("skill_package_mention_token_conflict");
    }
  }
}

async function createSkillPackageRevisionRow(args: {
  ctx: any;
  skillPackageId: any;
  instructionsMd: string;
  createdByUserId: any;
  nowMs: number;
}): Promise<any> {
  const existingRevisions = (await args.ctx.db
    .query("skillPackageRevisions")
    .withIndex("by_skill", (q: any) => q.eq("skillPackageId", args.skillPackageId))
    .collect()) as SkillPackageRevisionRow[];
  const nextRevisionNumber =
    existingRevisions.reduce(
      (max, row) =>
        typeof row.revisionNumber === "number" && Number.isFinite(row.revisionNumber)
          ? Math.max(max, Math.floor(row.revisionNumber))
          : max,
      0,
    ) + 1;
  return await args.ctx.db.insert("skillPackageRevisions", {
    skillPackageId: args.skillPackageId,
    revisionNumber: nextRevisionNumber,
    instructionsMd: args.instructionsMd,
    createdAt: args.nowMs,
    createdByUserId: args.createdByUserId,
  });
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
  const mentionToken = normalizeSkillMentionToken(name);
  if (!mentionToken) throw new Error("skill_package_mention_token_required");
  await assertOwnerSkillMentionTokenAvailable({
    ctx: args.ctx,
    ownerUserId: args.ownerUserId,
    mentionToken,
  });
  const description = normalizeSkillPackageDescription(args.description);
  const instructionsMd = normalizeSkillInstructionsMd(args.instructionsMd);
  if (!instructionsMd) throw new Error("skill_package_instructions_required");
  const skillPackageId = await args.ctx.db.insert("skillPackages", {
    ownerUserId: args.ownerUserId,
    name,
    mentionToken,
    description: description || undefined,
    instructionsMd,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  const revisionId = await createSkillPackageRevisionRow({
    ctx: args.ctx,
    skillPackageId,
    instructionsMd,
    createdByUserId: args.ownerUserId,
    nowMs,
  });
  await args.ctx.db.patch(skillPackageId, {
    activeRevisionId: revisionId,
    updatedAt: nowMs,
  });
  return skillPackageId;
}

async function updateSkillPackageRow(args: {
  ctx: any;
  skillPackage: SkillPackageRow;
  name?: string;
  description?: string;
  instructionsMd?: string;
  updatedByUserId: any;
  nowMs?: number;
}): Promise<SkillPackageRow> {
  const nowMs = args.nowMs ?? Date.now();
  const nextName = normalizeSkillPackageName(args.name ?? args.skillPackage.name);
  if (!nextName) throw new Error("skill_package_name_required");
  const nextMentionToken = normalizeSkillMentionToken(nextName);
  if (!nextMentionToken) throw new Error("skill_package_mention_token_required");
  await assertOwnerSkillMentionTokenAvailable({
    ctx: args.ctx,
    ownerUserId: args.skillPackage.ownerUserId,
    mentionToken: nextMentionToken,
    excludeSkillPackageId: args.skillPackage._id,
  });
  const nextDescription = normalizeSkillPackageDescription(
    args.description ?? args.skillPackage.description,
  );
  const nextInstructionsMd = normalizeSkillInstructionsMd(
    args.instructionsMd ?? args.skillPackage.instructionsMd,
  );
  if (!nextInstructionsMd) throw new Error("skill_package_instructions_required");

  const patch: Record<string, unknown> = {
    name: nextName,
    mentionToken: nextMentionToken,
    description: nextDescription || undefined,
    instructionsMd: nextInstructionsMd,
    updatedAt: nowMs,
  };

  const activeInstructions = await getSkillPackageActiveInstructionsMd(
    args.ctx,
    args.skillPackage,
  );
  const instructionsChanged = activeInstructions.instructionsMd !== nextInstructionsMd;
  if (instructionsChanged) {
    const revisionId = await createSkillPackageRevisionRow({
      ctx: args.ctx,
      skillPackageId: args.skillPackage._id,
      instructionsMd: nextInstructionsMd,
      createdByUserId: args.updatedByUserId,
      nowMs,
    });
    patch.activeRevisionId = revisionId;
  }

  await args.ctx.db.patch(args.skillPackage._id, patch);
  const updated = await getSkillPackageById(args.ctx, args.skillPackage._id);
  if (!updated) throw new Error("skill_package_not_found");
  return updated;
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
    const rows = await listOwnedSkillPackagesRows(ctx, userId);
    return rows.map((row) => mapSkillPackageReadModel(row));
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

export const updateOwnedSkillPackage = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    skillPackageId: v.id("skillPackages"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    instructionsMd: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const skillPackage = await requireOwnedSkillPackage({
      ctx,
      ownerUserId: userId,
      skillPackageId: args.skillPackageId,
    });
    const updated = await updateSkillPackageRow({
      ctx,
      skillPackage,
      name: args.name,
      description: args.description,
      instructionsMd: args.instructionsMd,
      updatedByUserId: userId,
      nowMs: args.nowMs,
    });
    return mapSkillPackageReadModel(updated);
  },
});

export const updateOwnedSkillPackageInternal = internalMutation({
  args: {
    ownerUserId: v.id("users"),
    skillPackageId: v.id("skillPackages"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    instructionsMd: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const skillPackage = await requireOwnedSkillPackage({
      ctx,
      ownerUserId: args.ownerUserId,
      skillPackageId: args.skillPackageId,
    });
    return await updateSkillPackageRow({
      ctx,
      skillPackage,
      name: args.name,
      description: args.description,
      instructionsMd: args.instructionsMd,
      updatedByUserId: args.ownerUserId,
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

    const installRows = (await ctx.db
      .query("userPlatformSkillInstalls")
      .withIndex("by_skill", (q: any) => q.eq("skillPackageId", args.skillPackageId))
      .collect()) as Array<{ _id: any }>;
    for (const row of installRows) {
      await ctx.db.delete(row._id);
    }

    const revisionRows = (await ctx.db
      .query("skillPackageRevisions")
      .withIndex("by_skill", (q: any) => q.eq("skillPackageId", args.skillPackageId))
      .collect()) as Array<{ _id: any }>;
    for (const row of revisionRows) {
      await ctx.db.delete(row._id);
    }

    await ctx.db.delete(skillPackage._id);
    return { deleted: true };
  },
});
