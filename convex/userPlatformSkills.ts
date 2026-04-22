import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { resolveUserIdForAuthenticatedRequest } from "./communityCore";
import {
  getSkillPackageActiveInstructionsMd,
  normalizeSkillCatalogId,
  normalizeSkillMentionToken,
  type SkillPackageRow,
  mapSkillPackageReadModel,
  readSkillMentionToken,
} from "./skillCore";

type UserPlatformSkillInstallRow = {
  _id: any;
  userId: any;
  skillPackageId: any;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

async function getSkillPackageById(ctx: any, skillPackageId: any): Promise<SkillPackageRow | null> {
  return ((await ctx.db.get(skillPackageId)) as SkillPackageRow | null) ?? null;
}

async function getUserPlatformSkillInstallById(
  ctx: any,
  userPlatformSkillInstallId: any,
): Promise<UserPlatformSkillInstallRow | null> {
  return ((await ctx.db.get(userPlatformSkillInstallId)) as UserPlatformSkillInstallRow | null) ?? null;
}

async function listUserPlatformSkillInstallRows(
  ctx: any,
  userId: any,
): Promise<UserPlatformSkillInstallRow[]> {
  const rows = (await ctx.db
    .query("userPlatformSkillInstalls")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect()) as UserPlatformSkillInstallRow[];
  return rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

async function findOwnedCatalogSkillPackage(
  ctx: any,
  ownerUserId: any,
  catalogSkillId: string,
): Promise<SkillPackageRow | null> {
  const normalizedCatalogSkillId = normalizeSkillCatalogId(catalogSkillId);
  if (!normalizedCatalogSkillId) return null;
  return (
    ((await ctx.db
      .query("skillPackages")
      .withIndex("by_owner_catalogSkillId", (q: any) =>
        q.eq("ownerUserId", ownerUserId).eq("catalogSkillId", normalizedCatalogSkillId),
      )
      .first()) as SkillPackageRow | null) ?? null
  );
}

async function requireExistingUserPlatformSkillInstall(args: {
  ctx: any;
  userId: any;
  userPlatformSkillInstallId: any;
}): Promise<UserPlatformSkillInstallRow> {
  const row = await getUserPlatformSkillInstallById(
    args.ctx,
    args.userPlatformSkillInstallId,
  );
  if (!row || String(row.userId) !== String(args.userId)) {
    throw new Error("user_platform_skill_install_not_found");
  }
  return row;
}

async function buildUserPlatformSkillInstallReadModel(args: {
  ctx: any;
  install: UserPlatformSkillInstallRow;
  skill: SkillPackageRow;
}) {
  const activeInstructions = await getSkillPackageActiveInstructionsMd(
    args.ctx,
    args.skill,
  );
  return {
    id: String(args.install._id),
    enabled: args.install.enabled === true,
    skill: {
      ...mapSkillPackageReadModel(args.skill),
      instructionsMd: activeInstructions.instructionsMd,
    },
  };
}

async function getUserPlatformSkillInstallReadModel(args: {
  ctx: any;
  userId: any;
  userPlatformSkillInstallId: any;
}): Promise<any> {
  const install = await requireExistingUserPlatformSkillInstall({
    ctx: args.ctx,
    userId: args.userId,
    userPlatformSkillInstallId: args.userPlatformSkillInstallId,
  });
  const skill = await getSkillPackageById(args.ctx, install.skillPackageId);
  if (!skill) throw new Error("user_platform_skill_install_missing_dependency");
  return await buildUserPlatformSkillInstallReadModel({
    ctx: args.ctx,
    install,
    skill,
  });
}

async function assertUserPlatformSkillMentionTokenAvailable(args: {
  ctx: any;
  userId: any;
  skillPackageId: any;
  excludeUserPlatformSkillInstallId?: any;
}): Promise<void> {
  const nextSkill = await getSkillPackageById(args.ctx, args.skillPackageId);
  if (!nextSkill) throw new Error("skill_package_not_found");
  const nextToken = readSkillMentionToken(nextSkill);
  if (!nextToken) throw new Error("skill_package_mention_token_required");
  const installs = await listUserPlatformSkillInstallRows(args.ctx, args.userId);
  for (const install of installs) {
    if (String(install._id) === String(args.excludeUserPlatformSkillInstallId ?? "")) {
      continue;
    }
    if (!install.enabled) continue;
    const installedSkill = await getSkillPackageById(args.ctx, install.skillPackageId);
    if (!installedSkill) continue;
    if (readSkillMentionToken(installedSkill) === nextToken) {
      throw new Error("user_platform_skill_mention_token_conflict");
    }
  }
}

async function upsertUserPlatformSkillInstallRow(args: {
  ctx: any;
  userId: any;
  skillPackageId: any;
  enabled: boolean;
  nowMs?: number;
}): Promise<any> {
  const existing = ((await args.ctx.db
    .query("userPlatformSkillInstalls")
    .withIndex("by_user_skill", (q: any) =>
      q.eq("userId", args.userId).eq("skillPackageId", args.skillPackageId),
    )
    .first()) as UserPlatformSkillInstallRow | null) ?? null;
  const nowMs = args.nowMs ?? Date.now();
  if (args.enabled) {
    await assertUserPlatformSkillMentionTokenAvailable({
      ctx: args.ctx,
      userId: args.userId,
      skillPackageId: args.skillPackageId,
      excludeUserPlatformSkillInstallId: existing?._id,
    });
  }
  if (existing) {
    await args.ctx.db.patch(existing._id, {
      enabled: args.enabled,
      updatedAt: nowMs,
    });
    return existing._id;
  }
  return await args.ctx.db.insert("userPlatformSkillInstalls", {
    userId: args.userId,
    skillPackageId: args.skillPackageId,
    enabled: args.enabled,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
}

async function assertUpdatedAttachedCommunityMentionTokenAvailable(args: {
  ctx: any;
  skillPackageId: any;
  nextMentionToken: string;
}): Promise<void> {
  const attachments = (await args.ctx.db
    .query("communitySkillAttachments")
    .withIndex("by_skill", (q: any) => q.eq("skillPackageId", args.skillPackageId))
    .collect()) as Array<{
    _id: any;
    communityId: any;
    skillPackageId: any;
    enabled: boolean;
  }>;
  for (const attachment of attachments) {
    if (!attachment.enabled) continue;
    const otherAttachments = (await args.ctx.db
      .query("communitySkillAttachments")
      .withIndex("by_community", (q: any) => q.eq("communityId", attachment.communityId))
      .collect()) as Array<{
      _id: any;
      skillPackageId: any;
      enabled: boolean;
    }>;
    for (const otherAttachment of otherAttachments) {
      if (!otherAttachment.enabled) continue;
      if (String(otherAttachment._id) === String(attachment._id)) continue;
      const otherSkill = await getSkillPackageById(args.ctx, otherAttachment.skillPackageId);
      if (!otherSkill) continue;
      if (readSkillMentionToken(otherSkill) === args.nextMentionToken) {
        throw new Error("community_skill_mention_token_conflict");
      }
    }
  }
}

export const listUserPlatformSkills = query({
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
    const installs = await listUserPlatformSkillInstallRows(ctx, userId);
    const rows = [];
    for (const install of installs) {
      const skill = await getSkillPackageById(ctx, install.skillPackageId);
      if (!skill) continue;
      rows.push(
        await buildUserPlatformSkillInstallReadModel({
          ctx,
          install,
          skill,
        }),
      );
    }
    return rows;
  },
});

export const createUserPlatformSkill = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    catalogSkillId: v.optional(v.string()),
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
    const existingCatalogSkill =
      typeof args.catalogSkillId === "string" && args.catalogSkillId.trim()
        ? await findOwnedCatalogSkillPackage(ctx, userId, args.catalogSkillId)
        : null;
    const skillPackageId =
      existingCatalogSkill?._id ??
      (await ctx.runMutation(internal.skillPackages.createSkillPackageInternal, {
        ownerUserId: userId,
        catalogSkillId: args.catalogSkillId,
        name: args.name,
        description: args.description,
        instructionsMd: args.instructionsMd,
        nowMs: args.nowMs,
      }));
    const userPlatformSkillInstallId = await upsertUserPlatformSkillInstallRow({
      ctx,
      userId,
      skillPackageId,
      enabled: true,
      nowMs: args.nowMs,
    });
    return await getUserPlatformSkillInstallReadModel({
      ctx,
      userId,
      userPlatformSkillInstallId,
    });
  },
});

export const updateUserPlatformSkillInstall = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    userPlatformSkillInstallId: v.id("userPlatformSkillInstalls"),
    enabled: v.optional(v.boolean()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const install = await requireExistingUserPlatformSkillInstall({
      ctx,
      userId,
      userPlatformSkillInstallId: args.userPlatformSkillInstallId,
    });
    const nextEnabled = args.enabled ?? install.enabled;
    if (nextEnabled) {
      await assertUserPlatformSkillMentionTokenAvailable({
        ctx,
        userId,
        skillPackageId: install.skillPackageId,
        excludeUserPlatformSkillInstallId: install._id,
      });
    }
    await ctx.db.patch(install._id, {
      enabled: nextEnabled,
      updatedAt: args.nowMs ?? Date.now(),
    });
    return await getUserPlatformSkillInstallReadModel({
      ctx,
      userId,
      userPlatformSkillInstallId: install._id,
    });
  },
});

export const updateUserPlatformSkillPackage = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    userPlatformSkillInstallId: v.id("userPlatformSkillInstalls"),
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
    const install = await requireExistingUserPlatformSkillInstall({
      ctx,
      userId,
      userPlatformSkillInstallId: args.userPlatformSkillInstallId,
    });
    const skill = await getSkillPackageById(ctx, install.skillPackageId);
    if (!skill || String(skill.ownerUserId) !== String(userId)) {
      throw new Error("skill_package_not_found");
    }
    const nextName =
      typeof args.name === "string" ? args.name.trim() : skill.name;
    if (!nextName) throw new Error("skill_package_name_required");
    const nextMentionToken = normalizeSkillMentionToken(nextName);
    await assertUpdatedAttachedCommunityMentionTokenAvailable({
      ctx,
      skillPackageId: skill._id,
      nextMentionToken,
    });
    await ctx.runMutation(internal.skillPackages.updateOwnedSkillPackageInternal, {
      ownerUserId: userId,
      skillPackageId: skill._id,
      name: args.name,
      description: args.description,
      instructionsMd: args.instructionsMd,
      nowMs: args.nowMs,
    });
    return await getUserPlatformSkillInstallReadModel({
      ctx,
      userId,
      userPlatformSkillInstallId: install._id,
    });
  },
});

export const deleteUserPlatformSkill = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    userPlatformSkillInstallId: v.id("userPlatformSkillInstalls"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const install = await requireExistingUserPlatformSkillInstall({
      ctx,
      userId,
      userPlatformSkillInstallId: args.userPlatformSkillInstallId,
    });
    const skill = await getSkillPackageById(ctx, install.skillPackageId);
    if (!skill || String(skill.ownerUserId) !== String(userId)) {
      throw new Error("skill_package_not_found");
    }
    await ctx.runMutation(internal.skillPackages.deleteSkillPackageCascadeInternal, {
      skillPackageId: skill._id,
    });
    return {
      removed: true,
      id: String(install._id),
    };
  },
});
