import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  requireCommunityChatAccess,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import {
  getSkillPackageActiveInstructionsMd,
  readSkillMentionToken,
  type SkillPackageRow,
} from "./skillCore";
import {
  extractExplicitSkillMentions,
  resolveScopedExplicitlyMentionedSkills,
  type ScopedExplicitlyMentionedSkillCandidate,
  type RuntimeSkillInferenceMessage,
} from "../shared/runtimeSkillActivation";

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

type RuntimeUserPlatformSkillInventory = {
  user_platform_skill_install_id: any;
  skill_package_id: any;
  name: string;
  mention_token: string;
  description: string | null;
};

type RuntimeSelectedUserPlatformSkill = RuntimeUserPlatformSkillInventory & {
  skill_revision_id: any | null;
  instructions_md: string;
};

type RuntimeCommunitySkillInventory = {
  community_skill_attachment_id: any;
  skill_package_id: any;
  name: string;
  mention_token: string;
  description: string | null;
};

type RuntimeSelectedCommunitySkill = RuntimeCommunitySkillInventory & {
  skill_revision_id: any | null;
  instructions_md: string;
};

type RuntimeScopedSelectedSkill =
  | RuntimeSelectedUserPlatformSkill
  | RuntimeSelectedCommunitySkill;

type RuntimeSkillResolutionResult = {
  requested_mention_tokens: string[];
  ambiguous_mention_tokens: string[];
  user_platform_skill_inventory: RuntimeUserPlatformSkillInventory[];
  selected_user_platform_skills: RuntimeSelectedUserPlatformSkill[];
  community_skill_inventory: RuntimeCommunitySkillInventory[];
  selected_community_skills: RuntimeSelectedCommunitySkill[];
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

async function resolveRuntimeUserPlatformSkillScope(args: {
  ctx: any;
  userId: any;
  includeSelectedData: boolean;
}): Promise<{
  inventory: RuntimeUserPlatformSkillInventory[];
  selectedCandidates: ScopedExplicitlyMentionedSkillCandidate<
    "personal",
    RuntimeSelectedUserPlatformSkill
  >[];
}> {
  const installs = await listUserPlatformSkillInstallRows(args.ctx, args.userId);
  const inventory: RuntimeUserPlatformSkillInventory[] = [];
  const selectedCandidates: ScopedExplicitlyMentionedSkillCandidate<
    "personal",
    RuntimeSelectedUserPlatformSkill
  >[] = [];
  for (const install of installs) {
    if (!install.enabled) continue;
    const skill = await getSkillPackageById(args.ctx, install.skillPackageId);
    const mentionToken = skill ? readSkillMentionToken(skill) : "";
    if (!skill || !mentionToken) continue;
    const inventoryItem: RuntimeUserPlatformSkillInventory = {
      user_platform_skill_install_id: install._id,
      skill_package_id: skill._id,
      name: skill.name,
      mention_token: mentionToken,
      description: skill.description ?? null,
    };
    inventory.push(inventoryItem);
    if (!args.includeSelectedData) continue;
    const activeInstructions = await getSkillPackageActiveInstructionsMd(
      args.ctx,
      skill,
    );
    if (!activeInstructions.instructionsMd) continue;
    selectedCandidates.push({
      scope: "personal",
      mentionToken,
      value: {
        ...inventoryItem,
        skill_revision_id: activeInstructions.revisionId,
        instructions_md: activeInstructions.instructionsMd,
      },
    });
  }
  return {
    inventory,
    selectedCandidates,
  };
}

async function resolveRuntimeCommunitySkillScope(args: {
  ctx: any;
  communityId: any;
  includeSelectedData: boolean;
}): Promise<{
  inventory: RuntimeCommunitySkillInventory[];
  selectedCandidates: ScopedExplicitlyMentionedSkillCandidate<
    "community",
    RuntimeSelectedCommunitySkill
  >[];
}> {
  const attachments = await listCommunitySkillAttachmentRows(
    args.ctx,
    args.communityId,
  );
  const inventory: RuntimeCommunitySkillInventory[] = [];
  const selectedCandidates: ScopedExplicitlyMentionedSkillCandidate<
    "community",
    RuntimeSelectedCommunitySkill
  >[] = [];
  for (const attachment of attachments) {
    if (!attachment.enabled) continue;
    const skill = await getSkillPackageById(args.ctx, attachment.skillPackageId);
    const mentionToken = skill ? readSkillMentionToken(skill) : "";
    if (!skill || !mentionToken) continue;
    const inventoryItem: RuntimeCommunitySkillInventory = {
      community_skill_attachment_id: attachment._id,
      skill_package_id: skill._id,
      name: skill.name,
      mention_token: mentionToken,
      description: skill.description ?? null,
    };
    inventory.push(inventoryItem);
    if (!args.includeSelectedData) continue;
    const activeInstructions = await getSkillPackageActiveInstructionsMd(
      args.ctx,
      skill,
    );
    if (!activeInstructions.instructionsMd) continue;
    selectedCandidates.push({
      scope: "community",
      mentionToken,
      value: {
        ...inventoryItem,
        skill_revision_id: activeInstructions.revisionId,
        instructions_md: activeInstructions.instructionsMd,
      },
    });
  }
  return {
    inventory,
    selectedCandidates,
  };
}

export const resolveRuntimeSkillSelectionInternal = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.optional(v.id("communities")),
    messages: v.array(
      v.object({
        role: v.string(),
        content: v.string(),
      }),
    ),
  },
  handler: async (ctx, args): Promise<RuntimeSkillResolutionResult> => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const requestedMentionTokens = extractExplicitSkillMentions(
      args.messages as RuntimeSkillInferenceMessage[],
    );
    const includeSelectedData = requestedMentionTokens.length > 0;
    let userPlatformSkillScope: Awaited<
      ReturnType<typeof resolveRuntimeUserPlatformSkillScope>
    > = {
      inventory: [],
      selectedCandidates: [],
    };
    let communitySkillInventory: RuntimeCommunitySkillInventory[] = [];
    let communitySelectedCandidates: ScopedExplicitlyMentionedSkillCandidate<
      "community",
      RuntimeSelectedCommunitySkill
    >[] = [];
    if (args.communityId) {
      await requireCommunityChatAccess({
        ctx,
        communityId: args.communityId,
        userId,
      });
      const communitySkillScope = await resolveRuntimeCommunitySkillScope({
        ctx,
        communityId: args.communityId,
        includeSelectedData,
      });
      communitySkillInventory = communitySkillScope.inventory;
      communitySelectedCandidates = communitySkillScope.selectedCandidates;
    } else {
      userPlatformSkillScope = await resolveRuntimeUserPlatformSkillScope({
        ctx,
        userId,
        includeSelectedData,
      });
    }

    const scopedCandidates: ScopedExplicitlyMentionedSkillCandidate<
      "personal" | "community",
      RuntimeScopedSelectedSkill
    >[] = [
      ...(args.communityId
        ? communitySelectedCandidates
        : userPlatformSkillScope.selectedCandidates),
    ];
    const resolved = resolveScopedExplicitlyMentionedSkills(
      scopedCandidates,
      requestedMentionTokens,
    );

    const selectedUserPlatformSkills = resolved.selected
      .filter(
        (
          selection,
        ): selection is {
          scope: "personal";
          value: RuntimeScopedSelectedSkill;
        } => selection.scope === "personal",
      )
      .map((selection) => selection.value as RuntimeSelectedUserPlatformSkill);

    const selectedCommunitySkills = resolved.selected
      .filter(
        (
          selection,
        ): selection is {
          scope: "community";
          value: RuntimeScopedSelectedSkill;
        } => selection.scope === "community",
      )
      .map((selection) => selection.value as RuntimeSelectedCommunitySkill);

    return {
      requested_mention_tokens: requestedMentionTokens,
      ambiguous_mention_tokens: resolved.ambiguousMentionTokens,
      user_platform_skill_inventory: userPlatformSkillScope.inventory,
      selected_user_platform_skills: selectedUserPlatformSkills,
      community_skill_inventory: communitySkillInventory,
      selected_community_skills: selectedCommunitySkills,
    };
  },
});
