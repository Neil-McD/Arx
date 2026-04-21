import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { resolveUserIdForAuthenticatedRequest } from "./communityCore";
import {
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

function buildUserPlatformSkillInstallReadModel(args: {
  install: UserPlatformSkillInstallRow;
  skill: SkillPackageRow;
}) {
  return {
    id: String(args.install._id),
    enabled: args.install.enabled === true,
    skill: mapSkillPackageReadModel(args.skill),
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
  return buildUserPlatformSkillInstallReadModel({
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
        buildUserPlatformSkillInstallReadModel({
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
    const skillPackageId = await ctx.runMutation(
      internal.skillPackages.createSkillPackageInternal,
      {
        ownerUserId: userId,
        name: args.name,
        description: args.description,
        instructionsMd: args.instructionsMd,
        nowMs: args.nowMs,
      },
    );
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

export const upsertUserPlatformSkillInstallInternal = internalMutation({
  args: {
    userId: v.id("users"),
    skillPackageId: v.id("skillPackages"),
    enabled: v.boolean(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await upsertUserPlatformSkillInstallRow({
      ctx,
      userId: args.userId,
      skillPackageId: args.skillPackageId,
      enabled: args.enabled,
      nowMs: args.nowMs,
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

export const uninstallUserPlatformSkill = mutation({
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
    await ctx.db.delete(install._id);
    return {
      removed: true,
      id: String(install._id),
    };
  },
});
