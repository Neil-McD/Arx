import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  getCommunityAndMembership,
  resolveCommunityAccessBundle,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import {
  getSkillPackageActiveInstructionsMd,
  readSkillMentionToken,
  type SkillPackageRow,
} from "./skillCore";
import {
  COMMUNITY_MANAGER_PLATFORM_RUNTIME_SKILLS,
  type RuntimePlatformSkillDefinition,
} from "./platformSkillRuntime";
import {
  extractExplicitSkillMentions,
  resolveScopedExplicitlyMentionedSkills,
  type ScopedExplicitlyMentionedSkillCandidate,
  type RuntimeSkillInferenceMessage,
} from "../shared/runtimeSkillActivation";
import {
  buildCommunityResourceRuntimeLaneState,
  type CommunityResourceRuntimeLaneState,
} from "../shared/communityResourceLane";

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
  catalog_skill_id: string | null;
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
  catalog_skill_id: string | null;
  name: string;
  mention_token: string;
  description: string | null;
};

type RuntimeSelectedCommunitySkill = RuntimeCommunitySkillInventory & {
  skill_revision_id: any | null;
  instructions_md: string;
};

type RuntimePlatformSkillInventory = {
  platform_skill_id: string;
  catalog_skill_id: string | null;
  name: string;
  mention_token: string;
  description: string | null;
  requires_capability: string | null;
};

type RuntimeSelectedPlatformSkill = RuntimePlatformSkillInventory & {
  instructions_md: string;
};

type RuntimeScopedSelectedSkill =
  | RuntimeSelectedPlatformSkill
  | RuntimeSelectedUserPlatformSkill
  | RuntimeSelectedCommunitySkill;

type RuntimeSkillResolutionResult = {
  requested_mention_tokens: string[];
  ambiguous_mention_tokens: string[];
  community_resource_lane: CommunityResourceRuntimeLaneState;
  platform_skill_inventory: RuntimePlatformSkillInventory[];
  selected_platform_skills: RuntimeSelectedPlatformSkill[];
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

async function resolveCommunityResourceRuntimeLane(args: {
  ctx: any;
  communityId: any | null;
  userId: any;
}): Promise<CommunityResourceRuntimeLaneState> {
  if (!args.communityId) {
    return buildCommunityResourceRuntimeLaneState("none");
  }
  const { community, membership } = await getCommunityAndMembership({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
  });
  const access = await resolveCommunityAccessBundle({
    ctx: args.ctx,
    community,
    membership,
    userId: args.userId,
  });
  if (!access.can_enter_community) {
    throw new Error("community_entitlement_required");
  }
  return buildCommunityResourceRuntimeLaneState(
    access.can_manage_resources ? "builder" : "member",
  );
}

function buildRuntimePlatformSkillInventoryItem(
  skill: RuntimePlatformSkillDefinition,
): RuntimePlatformSkillInventory {
  return {
    platform_skill_id: skill.id,
    catalog_skill_id: skill.catalogSkillId ?? null,
    name: skill.name,
    mention_token: skill.mentionToken,
    description: skill.description ?? null,
    requires_capability: skill.requiresCapability,
  };
}

async function resolveRuntimePlatformSkillScope(args: {
  ctx: any;
  communityId: any | null;
  userId: any;
  includeSelectedData: boolean;
  communityResourceLane: CommunityResourceRuntimeLaneState;
}): Promise<{
  inventory: RuntimePlatformSkillInventory[];
  selectedCandidates: ScopedExplicitlyMentionedSkillCandidate<
    "platform",
    RuntimeSelectedPlatformSkill
  >[];
}> {
  if (
    !args.communityId ||
    args.communityResourceLane.lane !== "builder" ||
    !args.communityResourceLane.can_use_resource_builder
  ) {
    return {
      inventory: [],
      selectedCandidates: [],
    };
  }

  const inventory = COMMUNITY_MANAGER_PLATFORM_RUNTIME_SKILLS.map(
    buildRuntimePlatformSkillInventoryItem,
  );
  return {
    inventory,
    selectedCandidates: args.includeSelectedData
      ? COMMUNITY_MANAGER_PLATFORM_RUNTIME_SKILLS.map((skill) => ({
          scope: "platform" as const,
          mentionToken: skill.mentionToken,
          value: {
            ...buildRuntimePlatformSkillInventoryItem(skill),
            instructions_md: skill.instructionsMd,
          },
        }))
      : [],
  };
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
      catalog_skill_id: skill.catalogSkillId ?? null,
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
      catalog_skill_id: skill.catalogSkillId ?? null,
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

function buildRuntimeSkillShadowState(
  inventory: Array<{
    catalog_skill_id?: string | null;
    mention_token?: string | null;
  }>,
): {
  catalogSkillIds: Set<string>;
  mentionTokens: Set<string>;
} {
  const catalogSkillIds = new Set<string>();
  const mentionTokens = new Set<string>();
  for (const skill of inventory) {
    if (typeof skill.catalog_skill_id === "string" && skill.catalog_skill_id.trim()) {
      catalogSkillIds.add(skill.catalog_skill_id.trim().toLowerCase());
    }
    if (typeof skill.mention_token === "string" && skill.mention_token.trim()) {
      mentionTokens.add(skill.mention_token.trim().toLowerCase());
    }
  }
  return {
    catalogSkillIds,
    mentionTokens,
  };
}

function isRuntimeSkillShadowed(args: {
  catalogSkillId: string | null | undefined;
  mentionToken: string | null | undefined;
  shadowState: ReturnType<typeof buildRuntimeSkillShadowState>;
}): boolean {
  const mentionToken =
    typeof args.mentionToken === "string"
      ? args.mentionToken.trim().toLowerCase()
      : "";
  if (
    typeof args.catalogSkillId === "string" &&
    args.catalogSkillId.trim() &&
    args.shadowState.catalogSkillIds.has(
      args.catalogSkillId.trim().toLowerCase(),
    )
  ) {
    return true;
  }
  return mentionToken
    ? args.shadowState.mentionTokens.has(mentionToken)
    : false;
}

function filterUserSkillScopeAgainstCommunity(args: {
  userSkillScope: {
    inventory: RuntimeUserPlatformSkillInventory[];
    selectedCandidates: ScopedExplicitlyMentionedSkillCandidate<
      "personal",
      RuntimeSelectedUserPlatformSkill
    >[];
  };
  communityInventory: RuntimeCommunitySkillInventory[];
}): {
  inventory: RuntimeUserPlatformSkillInventory[];
  selectedCandidates: ScopedExplicitlyMentionedSkillCandidate<
    "personal",
    RuntimeSelectedUserPlatformSkill
  >[];
} {
  if (args.communityInventory.length === 0) {
    return args.userSkillScope;
  }
  const shadowState = buildRuntimeSkillShadowState(args.communityInventory);
  return {
    inventory: args.userSkillScope.inventory.filter(
      (skill) =>
        !isRuntimeSkillShadowed({
          catalogSkillId: skill.catalog_skill_id,
          mentionToken: skill.mention_token,
          shadowState,
        }),
    ),
    selectedCandidates: args.userSkillScope.selectedCandidates.filter(
      (candidate) =>
        !isRuntimeSkillShadowed({
          catalogSkillId: candidate.value.catalog_skill_id,
          mentionToken: candidate.value.mention_token,
          shadowState,
        }),
    ),
  };
}

function filterUserSkillScopeAgainstPlatform(args: {
  userSkillScope: {
    inventory: RuntimeUserPlatformSkillInventory[];
    selectedCandidates: ScopedExplicitlyMentionedSkillCandidate<
      "personal",
      RuntimeSelectedUserPlatformSkill
    >[];
  };
  platformInventory: RuntimePlatformSkillInventory[];
}): {
  inventory: RuntimeUserPlatformSkillInventory[];
  selectedCandidates: ScopedExplicitlyMentionedSkillCandidate<
    "personal",
    RuntimeSelectedUserPlatformSkill
  >[];
} {
  if (args.platformInventory.length === 0) return args.userSkillScope;
  const shadowState = buildRuntimeSkillShadowState(args.platformInventory);
  return {
    inventory: args.userSkillScope.inventory.filter(
      (skill) =>
        !isRuntimeSkillShadowed({
          catalogSkillId: skill.catalog_skill_id,
          mentionToken: skill.mention_token,
          shadowState,
        }),
    ),
    selectedCandidates: args.userSkillScope.selectedCandidates.filter(
      (candidate) =>
        !isRuntimeSkillShadowed({
          catalogSkillId: candidate.value.catalog_skill_id,
          mentionToken: candidate.value.mention_token,
          shadowState,
        }),
    ),
  };
}

function filterCommunitySkillScopeAgainstPlatform(args: {
  communitySkillScope: {
    inventory: RuntimeCommunitySkillInventory[];
    selectedCandidates: ScopedExplicitlyMentionedSkillCandidate<
      "community",
      RuntimeSelectedCommunitySkill
    >[];
  };
  platformInventory: RuntimePlatformSkillInventory[];
}): {
  inventory: RuntimeCommunitySkillInventory[];
  selectedCandidates: ScopedExplicitlyMentionedSkillCandidate<
    "community",
    RuntimeSelectedCommunitySkill
  >[];
} {
  if (args.platformInventory.length === 0) return args.communitySkillScope;
  const shadowState = buildRuntimeSkillShadowState(args.platformInventory);
  return {
    inventory: args.communitySkillScope.inventory.filter(
      (skill) =>
        !isRuntimeSkillShadowed({
          catalogSkillId: skill.catalog_skill_id,
          mentionToken: skill.mention_token,
          shadowState,
        }),
    ),
    selectedCandidates: args.communitySkillScope.selectedCandidates.filter(
      (candidate) =>
        !isRuntimeSkillShadowed({
          catalogSkillId: candidate.value.catalog_skill_id,
          mentionToken: candidate.value.mention_token,
          shadowState,
        }),
    ),
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
    const communityResourceLane = await resolveCommunityResourceRuntimeLane({
      ctx,
      communityId: args.communityId ?? null,
      userId,
    });
    let userPlatformSkillScope = await resolveRuntimeUserPlatformSkillScope({
      ctx,
      userId,
      includeSelectedData,
    });
    const platformSkillScope = await resolveRuntimePlatformSkillScope({
      ctx,
      communityId: args.communityId ?? null,
      userId,
      includeSelectedData,
      communityResourceLane,
    });
    userPlatformSkillScope = filterUserSkillScopeAgainstPlatform({
      userSkillScope: userPlatformSkillScope,
      platformInventory: platformSkillScope.inventory,
    });
    let communitySkillInventory: RuntimeCommunitySkillInventory[] = [];
    let communitySelectedCandidates: ScopedExplicitlyMentionedSkillCandidate<
      "community",
      RuntimeSelectedCommunitySkill
    >[] = [];
    if (args.communityId) {
      const communitySkillScope = await resolveRuntimeCommunitySkillScope({
        ctx,
        communityId: args.communityId,
        includeSelectedData,
      });
      const platformFilteredCommunitySkillScope =
        filterCommunitySkillScopeAgainstPlatform({
          communitySkillScope,
          platformInventory: platformSkillScope.inventory,
        });
      communitySkillInventory = platformFilteredCommunitySkillScope.inventory;
      communitySelectedCandidates =
        platformFilteredCommunitySkillScope.selectedCandidates;
      userPlatformSkillScope = filterUserSkillScopeAgainstCommunity({
        userSkillScope: userPlatformSkillScope,
        communityInventory: communitySkillInventory,
      });
    }

    const scopedCandidates: ScopedExplicitlyMentionedSkillCandidate<
      "platform" | "personal" | "community",
      RuntimeScopedSelectedSkill
    >[] = [
      ...platformSkillScope.selectedCandidates,
      ...userPlatformSkillScope.selectedCandidates,
      ...communitySelectedCandidates,
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

    const selectedPlatformSkills = resolved.selected
      .filter(
        (
          selection,
        ): selection is {
          scope: "platform";
          value: RuntimeScopedSelectedSkill;
        } => selection.scope === "platform",
      )
      .map((selection) => selection.value as RuntimeSelectedPlatformSkill);

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
      community_resource_lane: communityResourceLane,
      platform_skill_inventory: platformSkillScope.inventory,
      selected_platform_skills: selectedPlatformSkills,
      user_platform_skill_inventory: userPlatformSkillScope.inventory,
      selected_user_platform_skills: selectedUserPlatformSkills,
      community_skill_inventory: communitySkillInventory,
      selected_community_skills: selectedCommunitySkills,
    };
  },
});
