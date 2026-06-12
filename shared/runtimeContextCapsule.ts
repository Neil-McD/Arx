import type { CommunityResourceRuntimeLaneState } from "./communityResourceLane.ts";
import type {
  RuntimeRecentToolAttemptPrompt,
  RuntimeTurnContextPacket,
} from "./runtimeTurnContextPacket.ts";

type ThreadWorkingStateLike = {
  goal?: string | null;
  currentStep?: string | null;
  completedSteps?: string[] | null;
  decisions?: string[] | null;
  openQuestions?: string[] | null;
  verifiedFindings?: string[] | null;
  nextAction?: string | null;
};

export type RuntimeContextCapsuleSkillInput = {
  name?: string | null;
  mention_token?: string | null;
  mentionToken?: string | null;
  description?: string | null;
};

export type RuntimeContextCapsuleMountedToolCapabilityInput = {
  app_name?: string | null;
  appName?: string | null;
  auth_type?: string | null;
  authType?: string | null;
  scopes?: Array<"user" | "community"> | null;
  default_scope?: "user" | "community" | null;
  defaultScope?: "user" | "community" | null;
  tool_count?: number | null;
  toolCount?: number | null;
  default_runtime_tool_names?: string[] | null;
  defaultRuntimeToolNames?: string[] | null;
  executable_runtime_tool_names?: string[] | null;
  executableRuntimeToolNames?: string[] | null;
};

export type RuntimeContextCapsuleV1 = {
  version: 1;
  currentRequest: string | null;
  continuity: {
    goal: string | null;
    currentStep: string | null;
    verified: string[];
    decisions: string[];
    openQuestions: string[];
    nextAction: string | null;
  };
  authority: {
    threadIdPresent: boolean;
    communityLens: "none" | "member" | "manager";
    projectBound: boolean;
    communityResourceLane: CommunityResourceRuntimeLaneState["lane"];
    allowedToolFamilies: string[];
  };
  selectedContext: {
    communityIdentity: {
      name: string | null;
      slug: string | null;
      oneLiner: string | null;
      aboutExcerpt: string | null;
    } | null;
    project: {
      label: string | null;
      description: string | null;
    } | null;
    mountedTools: {
      executableToolCount: number;
      defaultDiscoveryToolCount: number;
      shadowedToolCount: number;
      capabilityGroups: Array<{
        appName: string;
        authType: string | null;
        scopes: Array<"user" | "community">;
        defaultScope: "user" | "community";
        toolCount: number;
        defaultRuntimeToolNames: string[];
      }>;
    };
    skills: {
      platform: RuntimeContextCapsuleSkillScopeSummary;
      personal: RuntimeContextCapsuleSkillScopeSummary;
      community: RuntimeContextCapsuleSkillScopeSummary;
      requestedMentionTokens: string[];
      ambiguousMentionTokens: string[];
    };
    memoryRefs: RuntimeContextCapsuleRef[];
  };
  evidence: {
    recentToolAttempts: RuntimeContextCapsuleToolAttempt[];
    activeProcesses: RuntimeContextCapsuleProcess[];
    priorRunSnapshotRefs: RuntimeContextCapsuleRef[];
  };
  omissions: {
    omittedLargeText: boolean;
    omittedRawToolOutput: boolean;
    omittedUnselectedSkillBodies: number;
    omittedSelectedSkillBodiesFromCapsule: number;
    omittedUnexposedTools: number;
  };
};

export type RuntimeContextCapsuleSkillScopeSummary = {
  inventoryCount: number;
  selectedCount: number;
  inventory: RuntimeContextCapsuleSkillRef[];
  selected: RuntimeContextCapsuleSkillRef[];
};

export type RuntimeContextCapsuleSkillRef = {
  name: string;
  mentionToken: string | null;
  description: string | null;
};

export type RuntimeContextCapsuleToolAttempt = {
  toolName: string;
  status: "ok" | "error";
  commandOrTarget: string | null;
  failureKind: string | null;
  errorCode: string | null;
  connectedAppName: string | null;
  connectedAppToolName: string | null;
};

export type RuntimeContextCapsuleProcess = {
  status: string;
  command: string;
  cwd: string | null;
  previewStatus: string | null;
  healthStatus: string | null;
};

export type RuntimeContextCapsuleRef = {
  kind: string;
  label: string;
};

export type RuntimeContextCapsuleMetadataV1 = {
  version: 1;
  hash: string;
  byteSize: number;
  currentRequestPresent: boolean;
  continuityGoalPresent: boolean;
  sectionCounts: {
    allowedToolFamilies: number;
    mountedToolCapabilities: number;
    executableMountedTools: number;
    defaultDiscoveryMountedTools: number;
    shadowedMountedTools: number;
    skillInventory: number;
    selectedSkills: number;
    recentToolAttempts: number;
    activeProcesses: number;
    memoryRefs: number;
  };
  omissions: RuntimeContextCapsuleV1["omissions"];
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function compactText(value: unknown, limit: number): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function compactList(
  values: readonly (string | null | undefined)[] | null | undefined,
  limit: number,
  itemLimit: number,
): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => compactText(value, itemLimit))
    .filter((value): value is string => Boolean(value))
    .slice(0, limit);
}

function uniqueStrings(values: readonly (string | null | undefined)[] | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeSkillRef(value: RuntimeContextCapsuleSkillInput): RuntimeContextCapsuleSkillRef | null {
  const name = compactText(value.name, 80);
  const mentionToken = compactText(value.mention_token ?? value.mentionToken, 60);
  if (!name && !mentionToken) return null;
  return {
    name: name ?? mentionToken ?? "skill",
    mentionToken,
    description: compactText(value.description, 120),
  };
}

function buildSkillScopeSummary(params: {
  inventory: RuntimeContextCapsuleSkillInput[];
  selected: RuntimeContextCapsuleSkillInput[];
}): RuntimeContextCapsuleSkillScopeSummary {
  return {
    inventoryCount: params.inventory.length,
    selectedCount: params.selected.length,
    inventory: params.inventory
      .map(normalizeSkillRef)
      .filter((value): value is RuntimeContextCapsuleSkillRef => Boolean(value))
      .slice(0, 12),
    selected: params.selected
      .map(normalizeSkillRef)
      .filter((value): value is RuntimeContextCapsuleSkillRef => Boolean(value))
      .slice(0, 8),
  };
}

function normalizeCommunityLens(params: {
  communityId?: string | null;
  communityResourceLane?: CommunityResourceRuntimeLaneState | null;
}): "none" | "member" | "manager" {
  if (!normalizeText(params.communityId)) return "none";
  return params.communityResourceLane?.lane === "builder" ? "manager" : "member";
}

function inferToolFamilies(toolNames: readonly (string | null | undefined)[] | null | undefined): string[] {
  const families = new Set<string>();
  for (const toolName of uniqueStrings(toolNames)) {
    if (toolName.startsWith("community_resource")) families.add("community_resources");
    else if (toolName.startsWith("community_")) families.add("community");
    else if (toolName.startsWith("web_")) families.add("web");
    else if (toolName.startsWith("computer_")) families.add("computer");
    else if (toolName === "bash" || toolName === "read" || toolName === "write" || toolName === "edit" || toolName === "grep" || toolName === "glob") {
      families.add("workspace");
    } else if (toolName) {
      families.add(toolName.split("_")[0] || "tool");
    }
  }
  return [...families].sort().slice(0, 16);
}

function normalizeCapabilityGroup(
  group: RuntimeContextCapsuleMountedToolCapabilityInput,
): RuntimeContextCapsuleV1["selectedContext"]["mountedTools"]["capabilityGroups"][number] | null {
  const appName = compactText(group.app_name ?? group.appName, 80);
  if (!appName) return null;
  const scopes = Array.isArray(group.scopes)
    ? group.scopes.filter((scope): scope is "user" | "community" => scope === "user" || scope === "community")
    : [];
  const defaultScope =
    group.default_scope === "community" || group.defaultScope === "community"
      ? "community"
      : "user";
  const toolCountRaw = group.tool_count ?? group.toolCount;
  const toolCount = Number.isFinite(Number(toolCountRaw))
    ? Math.max(0, Math.floor(Number(toolCountRaw)))
    : 0;
  return {
    appName,
    authType: compactText(group.auth_type ?? group.authType, 40),
    scopes: scopes.length > 0 ? [...new Set(scopes)].sort() : [defaultScope],
    defaultScope,
    toolCount,
    defaultRuntimeToolNames: compactList(
      group.default_runtime_tool_names ?? group.defaultRuntimeToolNames,
      6,
      100,
    ),
  };
}

function compactToolAttempt(attempt: RuntimeRecentToolAttemptPrompt): RuntimeContextCapsuleToolAttempt {
  return {
    toolName: compactText(attempt.toolName, 80) ?? "tool",
    status: attempt.status,
    commandOrTarget: compactText(attempt.commandOrTarget, 140),
    failureKind: compactText(attempt.failureKind, 80),
    errorCode: compactText(attempt.errorCode, 80),
    connectedAppName: compactText(attempt.connectedAppName, 80),
    connectedAppToolName: compactText(attempt.connectedAppToolName, 80),
  };
}

function sumSelectedSkills(skills: RuntimeContextCapsuleV1["selectedContext"]["skills"]): number {
  return (
    skills.platform.selectedCount +
    skills.personal.selectedCount +
    skills.community.selectedCount
  );
}

function sumSkillInventory(skills: RuntimeContextCapsuleV1["selectedContext"]["skills"]): number {
  return (
    skills.platform.inventoryCount +
    skills.personal.inventoryCount +
    skills.community.inventoryCount
  );
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function buildRuntimeContextCapsule(params: {
  latestUserText?: string | null;
  threadId?: string | null;
  projectId?: string | null;
  projectLabel?: string | null;
  projectDescription?: string | null;
  communityId?: string | null;
  communityName?: string | null;
  communitySlug?: string | null;
  communityOneLiner?: string | null;
  communityAbout?: string | null;
  communityResourceLane?: CommunityResourceRuntimeLaneState | null;
  allowedToolNames?: readonly (string | null | undefined)[] | null;
  runtimeTurnContext: RuntimeTurnContextPacket;
  mountedToolCapabilityGroups?: RuntimeContextCapsuleMountedToolCapabilityInput[] | null;
  runtimeMountedToolCount?: number | null;
  defaultDiscoveryMountedToolCount?: number | null;
  shadowedMountedToolCount?: number | null;
  platformSkillInventory?: RuntimeContextCapsuleSkillInput[] | null;
  selectedPlatformSkills?: RuntimeContextCapsuleSkillInput[] | null;
  personalSkillInventory?: RuntimeContextCapsuleSkillInput[] | null;
  selectedPersonalSkills?: RuntimeContextCapsuleSkillInput[] | null;
  communitySkillInventory?: RuntimeContextCapsuleSkillInput[] | null;
  selectedCommunitySkills?: RuntimeContextCapsuleSkillInput[] | null;
  requestedSkillMentionTokens?: string[] | null;
  ambiguousSkillMentionTokens?: string[] | null;
}): RuntimeContextCapsuleV1 {
  const workingState = (params.runtimeTurnContext.threadWorkingState ?? {}) as ThreadWorkingStateLike;
  const currentRequest =
    compactText(params.latestUserText, 280) ??
    compactText(params.runtimeTurnContext.latestUserText, 280);
  const communityAbout = normalizeText(params.communityAbout);
  const projectLabel = compactText(params.projectLabel, 100);
  const projectDescription = compactText(params.projectDescription, 160);
  const capabilityGroups = (params.mountedToolCapabilityGroups ?? [])
    .map(normalizeCapabilityGroup)
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
    .slice(0, 12);
  const skills = {
    platform: buildSkillScopeSummary({
      inventory: params.platformSkillInventory ?? [],
      selected: params.selectedPlatformSkills ?? [],
    }),
    personal: buildSkillScopeSummary({
      inventory: params.personalSkillInventory ?? [],
      selected: params.selectedPersonalSkills ?? [],
    }),
    community: buildSkillScopeSummary({
      inventory: params.communitySkillInventory ?? [],
      selected: params.selectedCommunitySkills ?? [],
    }),
    requestedMentionTokens: compactList(params.requestedSkillMentionTokens, 8, 60),
    ambiguousMentionTokens: compactList(params.ambiguousSkillMentionTokens, 8, 60),
  };
  const activeProcesses = params.runtimeTurnContext.activeBackgroundTerminals
    .slice(0, 3)
    .map((terminal) => ({
      status: terminal.status,
      command: compactText(terminal.command, 140) ?? "process",
      cwd: compactText(terminal.cwd, 100),
      previewStatus: compactText(terminal.previewStatus, 60),
      healthStatus: compactText(terminal.healthStatus, 60),
    }));
  const recentToolAttempts = params.runtimeTurnContext.recentToolAttempts
    .slice(0, 6)
    .map(compactToolAttempt);
  const executableToolCount = Math.max(0, Math.floor(Number(params.runtimeMountedToolCount ?? 0) || 0));
  const defaultDiscoveryToolCount = Math.max(0, Math.floor(Number(params.defaultDiscoveryMountedToolCount ?? 0) || 0));
  const shadowedToolCount = Math.max(0, Math.floor(Number(params.shadowedMountedToolCount ?? 0) || 0));
  const selectedSkillCount =
    skills.platform.selectedCount +
    skills.personal.selectedCount +
    skills.community.selectedCount;
  const skillInventoryCount =
    skills.platform.inventoryCount +
    skills.personal.inventoryCount +
    skills.community.inventoryCount;
  return {
    version: 1,
    currentRequest,
    continuity: {
      goal: compactText(workingState.goal, 280),
      currentStep: compactText(workingState.currentStep, 220),
      verified: [
        ...compactList(workingState.verifiedFindings, 5, 180),
        ...compactList(workingState.completedSteps, 3, 180),
      ].slice(0, 6),
      decisions: compactList(workingState.decisions, 5, 180),
      openQuestions: compactList(workingState.openQuestions, 4, 180),
      nextAction: compactText(workingState.nextAction, 220),
    },
    authority: {
      threadIdPresent: Boolean(normalizeText(params.threadId)),
      communityLens: normalizeCommunityLens({
        communityId: params.communityId,
        communityResourceLane: params.communityResourceLane,
      }),
      projectBound: Boolean(normalizeText(params.projectId)),
      communityResourceLane: params.communityResourceLane?.lane ?? "none",
      allowedToolFamilies: inferToolFamilies(params.allowedToolNames),
    },
    selectedContext: {
      communityIdentity: normalizeText(params.communityId)
        ? {
            name: compactText(params.communityName, 100),
            slug: compactText(params.communitySlug, 100),
            oneLiner: compactText(params.communityOneLiner, 160),
            aboutExcerpt: compactText(params.communityAbout, 240),
          }
        : null,
      project:
        projectLabel || projectDescription
          ? {
              label: projectLabel,
              description: projectDescription,
            }
          : null,
      mountedTools: {
        executableToolCount,
        defaultDiscoveryToolCount,
        shadowedToolCount,
        capabilityGroups,
      },
      skills,
      memoryRefs: [],
    },
    evidence: {
      recentToolAttempts,
      activeProcesses,
      priorRunSnapshotRefs: [],
    },
    omissions: {
      omittedLargeText: communityAbout.length > 240,
      omittedRawToolOutput: params.runtimeTurnContext.recentToolAttempts.some(
        (attempt) => Boolean(normalizeText(attempt.outputPreview) || normalizeText(attempt.errorMessage)),
      ),
      omittedUnselectedSkillBodies: Math.max(0, skillInventoryCount - selectedSkillCount),
      omittedSelectedSkillBodiesFromCapsule: selectedSkillCount,
      omittedUnexposedTools: Math.max(0, executableToolCount - defaultDiscoveryToolCount),
    },
  };
}

function renderSkillScope(label: string, scope: RuntimeContextCapsuleSkillScopeSummary): string {
  const selected = scope.selected
    .map((skill) => skill.mentionToken ? `$${skill.mentionToken}` : skill.name)
    .join(", ");
  return `${label}: inventory=${scope.inventoryCount}; selected=${scope.selectedCount}${selected ? ` (${selected})` : ""}`;
}

function renderCapabilityGroups(
  groups: RuntimeContextCapsuleV1["selectedContext"]["mountedTools"]["capabilityGroups"],
): string {
  if (groups.length === 0) return "(none)";
  return groups
    .slice(0, 8)
    .map((group) => {
      const tools = group.defaultRuntimeToolNames.length > 0
        ? ` default_tools=${group.defaultRuntimeToolNames.join(",")}`
        : "";
      return `${group.appName}[${group.defaultScope}; tools=${group.toolCount}${tools}]`;
    })
    .join(" | ");
}

export function renderRuntimeContextCapsuleForPrompt(
  capsule: RuntimeContextCapsuleV1 | null | undefined,
): string | null {
  if (!capsule || capsule.version !== 1) return null;
  const communityIdentity = capsule.selectedContext.communityIdentity;
  const project = capsule.selectedContext.project;
  const skills = capsule.selectedContext.skills;
  const mountedTools = capsule.selectedContext.mountedTools;
  return [
    "RUNTIME_CONTEXT_CAPSULE",
    "Version: 1",
    `Current request: ${capsule.currentRequest || "(none)"}`,
    `Continuity goal: ${capsule.continuity.goal || "(none)"}`,
    `Current step: ${capsule.continuity.currentStep || "(none)"}`,
    `Verified: ${capsule.continuity.verified.length > 0 ? capsule.continuity.verified.join(" | ") : "(none)"}`,
    `Decisions: ${capsule.continuity.decisions.length > 0 ? capsule.continuity.decisions.join(" | ") : "(none)"}`,
    `Open questions: ${capsule.continuity.openQuestions.length > 0 ? capsule.continuity.openQuestions.join(" | ") : "(none)"}`,
    `Next action: ${capsule.continuity.nextAction || "(none)"}`,
    `Authority: community_lens=${capsule.authority.communityLens}; resource_lane=${capsule.authority.communityResourceLane}; project_bound=${capsule.authority.projectBound ? "yes" : "no"}; tool_families=${capsule.authority.allowedToolFamilies.join(",") || "(none)"}`,
    communityIdentity
      ? `Community identity: name=${communityIdentity.name || "(not set)"}; slug=${communityIdentity.slug || "(not set)"}; one_liner=${communityIdentity.oneLiner || "(not set)"}; about_excerpt=${communityIdentity.aboutExcerpt || "(not set)"}`
      : "Community identity: none.",
    project
      ? `Project context: label=${project.label || "(not set)"}; description=${project.description || "(not set)"}`
      : "Project context: none.",
    `Mounted tools: executable=${mountedTools.executableToolCount}; default_discovery=${mountedTools.defaultDiscoveryToolCount}; shadowed=${mountedTools.shadowedToolCount}; capabilities=${renderCapabilityGroups(mountedTools.capabilityGroups)}`,
    `Skills: ${renderSkillScope("platform", skills.platform)}; ${renderSkillScope("personal", skills.personal)}; ${renderSkillScope("community", skills.community)}`,
    `Skill mention state: requested=${skills.requestedMentionTokens.length > 0 ? skills.requestedMentionTokens.map((token) => `$${token}`).join(",") : "(none)"}; ambiguous=${skills.ambiguousMentionTokens.length > 0 ? skills.ambiguousMentionTokens.map((token) => `$${token}`).join(",") : "(none)"}`,
    `Evidence summary: recent_tool_attempts=${capsule.evidence.recentToolAttempts.length}; active_processes=${capsule.evidence.activeProcesses.length}; memory_refs=${capsule.selectedContext.memoryRefs.length}`,
    `Omissions: large_text=${capsule.omissions.omittedLargeText ? "yes" : "no"}; raw_tool_output=${capsule.omissions.omittedRawToolOutput ? "yes" : "no"}; unselected_skill_bodies=${capsule.omissions.omittedUnselectedSkillBodies}; selected_skill_bodies_omitted_from_capsule=${capsule.omissions.omittedSelectedSkillBodiesFromCapsule}; unexposed_tools=${capsule.omissions.omittedUnexposedTools}`,
    "Treat this as the compact continuity capsule. Retrieve deeper community, resource, skill, memory, or tool context through explicit runtime tools; do not infer from omitted text.",
  ].join("\n");
}

export function buildRuntimeContextCapsuleMetadata(
  capsule: RuntimeContextCapsuleV1,
): RuntimeContextCapsuleMetadataV1 {
  const serialized = JSON.stringify(capsule);
  const skills = capsule.selectedContext.skills;
  const mountedTools = capsule.selectedContext.mountedTools;
  return {
    version: 1,
    hash: hashString(serialized),
    byteSize: serialized.length,
    currentRequestPresent: Boolean(capsule.currentRequest),
    continuityGoalPresent: Boolean(capsule.continuity.goal),
    sectionCounts: {
      allowedToolFamilies: capsule.authority.allowedToolFamilies.length,
      mountedToolCapabilities: mountedTools.capabilityGroups.length,
      executableMountedTools: mountedTools.executableToolCount,
      defaultDiscoveryMountedTools: mountedTools.defaultDiscoveryToolCount,
      shadowedMountedTools: mountedTools.shadowedToolCount,
      skillInventory: sumSkillInventory(skills),
      selectedSkills: sumSelectedSkills(skills),
      recentToolAttempts: capsule.evidence.recentToolAttempts.length,
      activeProcesses: capsule.evidence.activeProcesses.length,
      memoryRefs: capsule.selectedContext.memoryRefs.length,
    },
    omissions: capsule.omissions,
  };
}
