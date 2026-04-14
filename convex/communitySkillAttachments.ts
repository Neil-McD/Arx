import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import {
  requireCommunityChatAccess,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import {
  buildSkillMentionToken,
  normalizeSkillString,
  type SkillPackageRow,
  mapSkillPackageReadModel,
} from "./skillCore";
import { selectExplicitlyMentionedSkills } from "../shared/communitySkillRuntime";

type CommunitySkillAttachmentRow = {
  _id: any;
  communityId: any;
  skillPackageId: any;
  attachedByUserId: any;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

type RuntimeCommunitySkillInventory = {
  community_skill_attachment_id: any;
  skill_package_id: any;
  name: string;
  mention_token: string;
  description: string | null;
};

type RuntimeSelectedCommunitySkill = RuntimeCommunitySkillInventory & {
  instructions_md: string;
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
  userId: any;
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

async function resolveRuntimeCommunitySkillInventory(args: {
  ctx: any;
  communityId: any;
}): Promise<RuntimeCommunitySkillInventory[]> {
  const attachments = await listCommunitySkillAttachmentRows(args.ctx, args.communityId);
  const resolved: RuntimeCommunitySkillInventory[] = [];
  for (const attachment of attachments) {
    if (!attachment.enabled) continue;
    const skill = await getSkillPackageById(args.ctx, attachment.skillPackageId);
    if (!skill) continue;
    const mentionToken = buildSkillMentionToken(skill.name);
    if (!mentionToken) continue;
    resolved.push({
      community_skill_attachment_id: attachment._id,
      skill_package_id: skill._id,
      name: skill.name,
      mention_token: mentionToken,
      description: skill.description ?? null,
    });
  }
  return resolved;
}

async function resolveRuntimeSelectedCommunitySkills(args: {
  ctx: any;
  communityId: any;
  requestedMentionTokens: string[];
}): Promise<RuntimeSelectedCommunitySkill[]> {
  if (args.requestedMentionTokens.length === 0) return [];
  const attachments = await listCommunitySkillAttachmentRows(args.ctx, args.communityId);
  const candidates: Array<{
    mentionToken: string;
    value: RuntimeSelectedCommunitySkill;
  }> = [];
  for (const attachment of attachments) {
    if (!attachment.enabled) continue;
    const skill = await getSkillPackageById(args.ctx, attachment.skillPackageId);
    const mentionToken = buildSkillMentionToken(skill?.name);
    if (!skill || !mentionToken) continue;
    candidates.push({
      mentionToken,
      value: {
        community_skill_attachment_id: attachment._id,
        skill_package_id: skill._id,
        name: skill.name,
        mention_token: mentionToken,
        description: skill.description ?? null,
        instructions_md: skill.instructionsMd,
      },
    });
  }
  return selectExplicitlyMentionedSkills(candidates, args.requestedMentionTokens);
}

async function assertCommunitySkillMentionTokenAvailable(args: {
  ctx: any;
  communityId: any;
  skillPackageId: any;
  excludeCommunitySkillAttachmentId?: any;
}): Promise<void> {
  const skill = await getSkillPackageById(args.ctx, args.skillPackageId);
  if (!skill) throw new Error("skill_package_not_found");
  const nextToken = buildSkillMentionToken(skill.name);
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
    if (buildSkillMentionToken(attachedSkill.name) === nextToken) {
      throw new Error("community_skill_mention_token_conflict");
    }
  }
}

async function resolveAuthenticatedActionUser(args: {
  ctx: any;
  authSubject?: string | null;
}): Promise<{ userId: any; authSubject: string }> {
  const actor = (await args.ctx.runQuery(
    internal.authActor.resolveAuthenticatedActorInternal as any,
    {
      authSubject: args.authSubject ?? undefined,
    },
  )) as { authSubject?: unknown; dbUserId?: unknown } | null;
  const authSubject = normalizeSkillString(actor?.authSubject, 200);
  const userId = actor?.dbUserId;
  if (!authSubject || !userId) throw new Error("authenticated_user_required");
  return {
    userId,
    authSubject,
  };
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
      userId: args.userId,
    });
  },
});

export const listRuntimeCommunitySkillInventoryInternal = internalQuery({
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
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });
    return await resolveRuntimeCommunitySkillInventory({
      ctx,
      communityId: args.communityId,
    });
  },
});

export const listRuntimeSelectedCommunitySkillsInternal = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    requestedMentionTokens: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });
    return await resolveRuntimeSelectedCommunitySkills({
      ctx,
      communityId: args.communityId,
      requestedMentionTokens: args.requestedMentionTokens,
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
      userId,
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
