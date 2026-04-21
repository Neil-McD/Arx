import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import {
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import {
  type SkillPackageRow,
  mapSkillPackageReadModel,
  readSkillMentionToken,
} from "./skillCore";

type CommunitySkillAttachmentRow = {
  _id: any;
  communityId: any;
  skillPackageId: any;
  attachedByUserId: any;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

async function getCommunitySkillAttachmentById(
  ctx: any,
  communitySkillAttachmentId: any,
): Promise<CommunitySkillAttachmentRow | null> {
  return ((await ctx.db.get(
    communitySkillAttachmentId,
  )) as CommunitySkillAttachmentRow | null) ?? null;
}

async function getSkillPackageById(
  ctx: any,
  skillPackageId: any,
): Promise<SkillPackageRow | null> {
  return ((await ctx.db.get(skillPackageId)) as SkillPackageRow | null) ?? null;
}

async function listCommunitySkillAttachmentRows(
  ctx: any,
  communityId: any,
): Promise<CommunitySkillAttachmentRow[]> {
  return (await ctx.db
    .query("communitySkillAttachments")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .collect()) as CommunitySkillAttachmentRow[];
}

async function requireExistingCommunitySkillAttachment(args: {
  ctx: any;
  communityId: any;
  communitySkillAttachmentId: any;
}): Promise<CommunitySkillAttachmentRow> {
  const row = await getCommunitySkillAttachmentById(
    args.ctx,
    args.communitySkillAttachmentId,
  );
  if (!row || String(row.communityId) !== String(args.communityId)) {
    throw new Error("community_skill_attachment_not_found");
  }
  return row;
}

function buildCommunitySkillReadModel(args: {
  attachment: CommunitySkillAttachmentRow;
  skill: SkillPackageRow;
}) {
  return {
    id: String(args.attachment._id),
    enabled: args.attachment.enabled === true,
    skill: mapSkillPackageReadModel(args.skill),
  };
}

async function getCommunitySkillAttachmentReadModel(args: {
  ctx: any;
  communityId: any;
  communitySkillAttachmentId: any;
}): Promise<any> {
  const attachment = await requireExistingCommunitySkillAttachment({
    ctx: args.ctx,
    communityId: args.communityId,
    communitySkillAttachmentId: args.communitySkillAttachmentId,
  });
  const skill = await getSkillPackageById(args.ctx, attachment.skillPackageId);
  if (!skill) throw new Error("community_skill_attachment_missing_dependency");
  return buildCommunitySkillReadModel({
    attachment,
    skill,
  });
}

async function upsertCommunitySkillAttachmentRow(args: {
  ctx: any;
  communityId: any;
  skillPackageId: any;
  attachedByUserId: any;
  enabled: boolean;
  nowMs?: number;
}): Promise<any> {
  const existing = ((await args.ctx.db
    .query("communitySkillAttachments")
    .withIndex("by_community_skill", (q: any) =>
      q.eq("communityId", args.communityId).eq("skillPackageId", args.skillPackageId),
    )
    .first()) as CommunitySkillAttachmentRow | null) ?? null;
  const nowMs = args.nowMs ?? Date.now();
  if (args.enabled) {
    await assertCommunitySkillMentionTokenAvailable({
      ctx: args.ctx,
      communityId: args.communityId,
      skillPackageId: args.skillPackageId,
      excludeCommunitySkillAttachmentId: existing?._id,
    });
  }
  if (existing) {
    await args.ctx.db.patch(existing._id, {
      enabled: args.enabled,
      updatedAt: nowMs,
    });
    return existing._id;
  }
  return await args.ctx.db.insert("communitySkillAttachments", {
    communityId: args.communityId,
    skillPackageId: args.skillPackageId,
    attachedByUserId: args.attachedByUserId,
    enabled: args.enabled,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
}

async function assertCommunitySkillMentionTokenAvailable(args: {
  ctx: any;
  communityId: any;
  skillPackageId: any;
  excludeCommunitySkillAttachmentId?: any;
}): Promise<void> {
  const skill = await getSkillPackageById(args.ctx, args.skillPackageId);
  if (!skill) throw new Error("skill_package_not_found");
  const nextToken = readSkillMentionToken(skill);
  if (!nextToken) throw new Error("skill_package_mention_token_required");
  const attachments = await listCommunitySkillAttachmentRows(args.ctx, args.communityId);
  for (const attachment of attachments) {
    if (
      String(attachment._id) === String(args.excludeCommunitySkillAttachmentId ?? "")
    ) {
      continue;
    }
    if (!attachment.enabled) continue;
    const attachedSkill = await getSkillPackageById(args.ctx, attachment.skillPackageId);
    if (!attachedSkill) continue;
    if (readSkillMentionToken(attachedSkill) === nextToken) {
      throw new Error("community_skill_mention_token_conflict");
    }
  }
}

export const getCommunitySkillAttachmentReadModelInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    communitySkillAttachmentId: v.id("communitySkillAttachments"),
  },
  handler: async (ctx, args) => {
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    return await getCommunitySkillAttachmentReadModel({
      ctx,
      communityId: args.communityId,
      communitySkillAttachmentId: args.communitySkillAttachmentId,
    });
  },
});

export const listCommunitySkillAttachments = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const attachments = await listCommunitySkillAttachmentRows(ctx, args.communityId);
    const rows = [];
    for (const attachment of attachments) {
      const skill = await getSkillPackageById(ctx, attachment.skillPackageId);
      if (!skill) continue;
      rows.push(
        buildCommunitySkillReadModel({
          attachment,
          skill,
        }),
      );
    }
    return rows;
  },
});

export const assertCommunityManagerAccessInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    return {
      communityId: String(community._id),
    };
  },
});

export const upsertCommunitySkillAttachmentInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    skillPackageId: v.id("skillPackages"),
    attachedByUserId: v.id("users"),
    enabled: v.boolean(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await upsertCommunitySkillAttachmentRow({
      ctx,
      communityId: args.communityId,
      skillPackageId: args.skillPackageId,
      attachedByUserId: args.attachedByUserId,
      enabled: args.enabled,
      nowMs: args.nowMs,
    });
  },
});

export const attachSkillPackageToCommunity = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    skillPackageId: v.id("skillPackages"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const skill = await getSkillPackageById(ctx, args.skillPackageId);
    if (!skill) throw new Error("skill_package_not_found");
    if (String(skill.ownerUserId) !== String(userId)) {
      throw new Error("skill_package_not_attachable");
    }
    const communitySkillAttachmentId = await upsertCommunitySkillAttachmentRow({
      ctx,
      communityId: args.communityId,
      skillPackageId: args.skillPackageId,
      attachedByUserId: userId,
      enabled: true,
      nowMs: args.nowMs,
    });
    return await getCommunitySkillAttachmentReadModel({
      ctx,
      communityId: args.communityId,
      communitySkillAttachmentId,
    });
  },
});

export const updateCommunitySkillAttachment = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    communitySkillAttachmentId: v.id("communitySkillAttachments"),
    enabled: v.optional(v.boolean()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const attachment = await requireExistingCommunitySkillAttachment({
      ctx,
      communityId: args.communityId,
      communitySkillAttachmentId: args.communitySkillAttachmentId,
    });
    const nextEnabled = args.enabled ?? attachment.enabled;
    if (nextEnabled) {
      await assertCommunitySkillMentionTokenAvailable({
        ctx,
        communityId: args.communityId,
        skillPackageId: attachment.skillPackageId,
        excludeCommunitySkillAttachmentId: attachment._id,
      });
    }
    await ctx.db.patch(attachment._id, {
      enabled: nextEnabled,
      updatedAt: args.nowMs ?? Date.now(),
    });
    const updated = await getCommunitySkillAttachmentById(ctx, attachment._id);
    const skill = await getSkillPackageById(ctx, attachment.skillPackageId);
    if (!updated || !skill) {
      throw new Error("community_skill_attachment_not_found");
    }
    return buildCommunitySkillReadModel({
      attachment: updated,
      skill,
    });
  },
});

export const detachCommunitySkill = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    communitySkillAttachmentId: v.id("communitySkillAttachments"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const attachment = await requireExistingCommunitySkillAttachment({
      ctx,
      communityId: args.communityId,
      communitySkillAttachmentId: args.communitySkillAttachmentId,
    });
    await ctx.db.delete(attachment._id);
    return {
      removed: true,
      id: String(attachment._id),
    };
  },
});
