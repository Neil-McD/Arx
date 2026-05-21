import { query } from "./_generated/server";
import { v } from "convex/values";

import {
  requireCommunityChatAccess,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import {
  getSkillPackageActiveInstructionsMd,
  mapSkillPackageReadModel,
  type SkillPackageRow,
} from "./skillCore";
import type { CommunityAttachedSkill } from "../shared/communitySkillTypes";
import { buildEffectiveSkills } from "../shared/effectiveSkills";
import type { UserPlatformInstalledSkill } from "../shared/userPlatformSkillTypes";

type UserPlatformSkillInstallRow = {
  _id: any;
  userId: any;
  skillPackageId: any;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

type CommunitySkillAttachmentRow = {
  _id: any;
  communityId: any;
  skillPackageId: any;
  attachedByUserId: any;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

async function getSkillPackageById(
  ctx: any,
  skillPackageId: any,
): Promise<SkillPackageRow | null> {
  return ((await ctx.db.get(skillPackageId)) as SkillPackageRow | null) ?? null;
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

async function listCommunitySkillAttachmentRows(
  ctx: any,
  communityId: any,
): Promise<CommunitySkillAttachmentRow[]> {
  const rows = (await ctx.db
    .query("communitySkillAttachments")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .collect()) as CommunitySkillAttachmentRow[];
  return rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
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

function buildCommunitySkillAttachmentReadModel(args: {
  attachment: CommunitySkillAttachmentRow;
  skill: SkillPackageRow;
}) {
  return {
    id: String(args.attachment._id),
    enabled: args.attachment.enabled === true,
    skill: mapSkillPackageReadModel(args.skill),
  };
}

export const listEffectiveSkills = query({
  args: {
    authSubject: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    communityId: v.optional(v.id("communities")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });

    const personalSkills: UserPlatformInstalledSkill[] = [];
    for (const install of await listUserPlatformSkillInstallRows(ctx, userId)) {
      const skill = await getSkillPackageById(ctx, install.skillPackageId);
      if (!skill) continue;
      personalSkills.push(
        await buildUserPlatformSkillInstallReadModel({
          ctx,
          install,
          skill,
        }),
      );
    }

    if (!args.communityId) {
      return buildEffectiveSkills({
        personalSkills,
        communitySkills: [],
      });
    }

    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });

    const communitySkills: CommunityAttachedSkill[] = [];
    for (const attachment of await listCommunitySkillAttachmentRows(
      ctx,
      args.communityId,
    )) {
      const skill = await getSkillPackageById(ctx, attachment.skillPackageId);
      if (!skill) continue;
      communitySkills.push(
        buildCommunitySkillAttachmentReadModel({
          attachment,
          skill,
        }),
      );
    }

    return buildEffectiveSkills({
      personalSkills,
      communitySkills,
    });
  },
});
