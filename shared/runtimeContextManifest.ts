import {
  isComputerUseToolName,
  type RetrievalToolName,
} from "./retrievalTools.ts";
import {
  EMPTY_COMMUNITY_RESOURCE_RUNTIME_LANE,
  normalizeCommunityResourceRuntimeLaneState,
  type CommunityResourceRuntimeLaneState,
} from "./communityResourceLane.ts";
import type { RuntimeTurnEnvelopeV1 } from "./runtimeTurnEnvelope.ts";
import type { RuntimeTurnContextPacket } from "./runtimeTurnContextPacket.ts";
import type { RuntimeInvocationSurface } from "./runtimeInvocationSurface.ts";
import type { MemberIdentityContextStatus } from "./memberAgentIdentityContext.ts";
import {
  normalizeMemberAgentSurfaceContext,
  type MemberAgentSurfaceContextV1,
} from "./memberAgentSurfaceContext.ts";

export type RuntimeContextManifestOwner =
  | "platform"
  | "user"
  | "community"
  | "workspace"
  | "web"
  | "message"
  | "provider"
  | "runtime";

export type RuntimeContextManifestPromptAuthority =
  | "platform"
  | "runtime"
  | "scoped"
  | "workflow"
  | "demo";

export type RuntimeContextManifestRetrieval =
  | "injected_excerpt"
  | "tool_available"
  | "runtime_fragment"
  | "stored_only"
  | "excluded";

export type RuntimeContextManifestVisibility =
  | "public"
  | "authenticated"
  | "member"
  | "owner"
  | "private"
  | "server";

export type RuntimeContextManifestToolEffect =
  | "read"
  | "write"
  | "external"
  | "process"
  | "ui";

export type RuntimeContextManifestPrompt = {
  id: string;
  owner: RuntimeContextManifestOwner;
  authority: RuntimeContextManifestPromptAuthority;
  injected: boolean;
  source: string;
  reason: string;
  sourceVersion?: string | null;
  activationRoute?: string | null;
  activationReason?: string | null;
};

export type RuntimeContextManifestResource = {
  id: string;
  owner: RuntimeContextManifestOwner;
  retrieval: RuntimeContextManifestRetrieval;
  visibility: RuntimeContextManifestVisibility;
  source: string;
  reason: string;
};

export type RuntimeContextManifestTool = {
  name: string;
  family: string;
  grantedBy: string;
  effect: RuntimeContextManifestToolEffect;
  source: "fixed_runtime_tool";
};

export type RuntimeContextManifestRuntimeState = {
  id: string;
  kind: string;
  status?: MemberIdentityContextStatus;
  rendered: boolean;
  redacted: boolean;
  source: string;
  reason: string;
  maxChars?: number | null;
};

export type RuntimeContextManifestExclusion = {
  source: string;
  reason: string;
};

export type RuntimeContextManifestV1 = {
  version: 1;
  generatedAt: string | null;
  scope: {
    userId: string | null;
    threadId: string | null;
    communityId: string | null;
    communityContextVersion: number | null;
    projectId: string | null;
    resourceLane: CommunityResourceRuntimeLaneState["lane"];
    harnessName: string | null;
    inferenceSource: string | null;
    memberAgentSurfaceContext: MemberAgentSurfaceContextV1 | null;
  };
  request: {
    latestUserText: string | null;
    conversationMessageCount: number;
    hasUserRequest: boolean;
  };
  prompts: RuntimeContextManifestPrompt[];
  resources: RuntimeContextManifestResource[];
  tools: RuntimeContextManifestTool[];
  runtimeState: RuntimeContextManifestRuntimeState[];
  exclusions: RuntimeContextManifestExclusion[];
  summary: {
    promptCount: number;
    resourceCount: number;
    toolCount: number;
    runtimeStateCount: number;
    exclusionCount: number;
    fixedToolCount: number;
  };
};

type ManifestSkillInput = {
  name?: unknown;
  mention_token?: unknown;
  skill_revision_id?: unknown;
  platform_skill_id?: unknown;
  user_platform_skill_install_id?: unknown;
  community_skill_attachment_id?: unknown;
  activation_route?: unknown;
  activation_reason?: unknown;
};

export type BuildRuntimeContextManifestInput = {
  generatedAt?: string | null;
  userId?: string | null;
  threadId?: string | null;
  communityId?: string | null;
  communityContextVersion?: number | null;
  projectId?: string | null;
  harnessName?: string | null;
  inferenceSource?: string | null;
  latestUserText?: string | null;
  messages?: Array<{ role?: string | null; content?: string | null }> | null;
  allowedToolNames?: readonly RetrievalToolName[] | null;
  communityResourceLane?: CommunityResourceRuntimeLaneState | null;
  communitySystemPrompt?: string | null;
  communityAbout?: string | null;
  agentSoul?: string | null;
  runtimeTurnEnvelope?: RuntimeTurnEnvelopeV1 | null;
  runtimeTurnContext?: RuntimeTurnContextPacket | null;
  selectedPlatformSkills?: readonly ManifestSkillInput[] | null;
  selectedPersonalSkills?: readonly ManifestSkillInput[] | null;
  selectedCommunitySkills?: readonly ManifestSkillInput[] | null;
  hasBrowserBuiltDemoPrompt?: boolean | null;
  invocationSurface?: RuntimeInvocationSurface | null;
  memberAgentSurfaceContext?: MemberAgentSurfaceContextV1 | null;
  memberIdentityContextMd?: string | null;
  memberIdentityContextStatus?: MemberIdentityContextStatus | null;
};

const PRODUCT_DOC_TOOL_NAMES = new Set<RetrievalToolName>([
  "search_product_docs",
  "get_product_doc",
]);

const COMMUNITY_CONTEXT_TOOL_NAMES = new Set<RetrievalToolName>([
  "polynet_list",
  "polynet_read",
]);

const MEMBER_CONVERSATION_TOOL_NAMES = new Set<RetrievalToolName>([
  "member_conversations_list",
  "member_conversation_read",
]);

const COMMUNITY_DIRECTORY_TOOL_NAMES = new Set<RetrievalToolName>([
  "polynet_list_communities",
  "polynet_get_community",
]);

const COMMUNITY_RESOURCE_TOOL_NAMES = new Set<RetrievalToolName>([
  "community_resources_read",
  "community_resources_search",
  "community_resource_builder_list",
  "community_resource_builder_read",
  "community_resource_builder_stage_changeset",
  "community_resource_builder_apply_changeset",
]);

const COMMUNITY_ACTIVITY_TOOL_NAMES = new Set<RetrievalToolName>([
  "community_search",
  "community_chat_search",
  "community_chat_read",
  "community_ai_feed_search",
  "community_ai_feed_read",
]);

const COMMUNITY_MEMORY_TOOL_NAMES = new Set<RetrievalToolName>([
  "community_memory_search",
  "community_memory_read",
]);

const COMMUNITY_WRITE_TOOL_NAMES = new Set<RetrievalToolName>([
  "community_write",
]);

const MEMBER_PROFILE_WRITE_TOOL_NAMES = new Set<RetrievalToolName>([
  "member_profile_confirm_facts",
]);

const WEB_RESEARCH_TOOL_NAMES = new Set<RetrievalToolName>([
  "web_research",
  "web_crawl",
]);

const SANDBOX_READ_TOOL_NAMES = new Set<RetrievalToolName>([
  "list_dir",
  "read",
  "glob",
  "grep",
  "sha256",
]);

const SANDBOX_WRITE_TOOL_NAMES = new Set<RetrievalToolName>([
  "write",
  "edit",
  "bash",
]);

const TERMINAL_TOOL_NAMES = new Set<RetrievalToolName>([
  "terminal_start",
  "terminal_read",
  "terminal_write",
  "terminal_stop",
]);

function compactText(value: unknown, limit: number): string | null {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function hasText(value: unknown): boolean {
  return Boolean(compactText(value, 1));
}

function resolveMemberIdentityContextStatus(
  params: BuildRuntimeContextManifestInput,
): MemberIdentityContextStatus {
  if (params.invocationSurface !== "member_agent_dock") return "not_applicable";
  if (params.memberIdentityContextStatus === "error") return "error";
  if (params.memberIdentityContextStatus === "loaded" && hasText(params.memberIdentityContextMd)) {
    return "loaded";
  }
  return hasText(params.memberIdentityContextMd) ? "loaded" : "empty";
}

function hasMemberIdentityContext(params: BuildRuntimeContextManifestInput): boolean {
  return resolveMemberIdentityContextStatus(params) === "loaded";
}

function uniqueToolNames(values: readonly RetrievalToolName[] | null | undefined): RetrievalToolName[] {
  if (!Array.isArray(values)) return [];
  const out: RetrievalToolName[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const toolName = String(value ?? "").trim() as RetrievalToolName;
    if (!toolName || seen.has(toolName)) continue;
    seen.add(toolName);
    out.push(toolName);
  }
  return out;
}

function selectedSkillId(
  scope: "platform" | "personal" | "community",
  skill: ManifestSkillInput,
): string {
  const token = compactText(skill.mention_token, 80);
  if (token) return `${scope}_skill:${token}`;
  const fallback =
    compactText(skill.platform_skill_id, 120) ??
    compactText(skill.user_platform_skill_install_id, 120) ??
    compactText(skill.community_skill_attachment_id, 120) ??
    compactText(skill.name, 120) ??
    "unknown";
  return `${scope}_skill:${fallback}`;
}

function pushSelectedSkillPrompts(args: {
  prompts: RuntimeContextManifestPrompt[];
  scope: "platform" | "personal" | "community";
  owner: RuntimeContextManifestOwner;
  skills: readonly ManifestSkillInput[] | null | undefined;
}): void {
  if (!Array.isArray(args.skills)) return;
  for (const skill of args.skills) {
    const skillName = compactText(skill.name, 120);
    const activationRoute = compactText(skill.activation_route, 80);
    const activationReason = compactText(skill.activation_reason, 300);
    args.prompts.push({
      id: selectedSkillId(args.scope, skill),
      owner: args.owner,
      authority: "workflow",
      injected: true,
      source: "runtime_skill_resolution",
      reason: skillName
        ? `selected skill instructions for ${skillName}`
        : "selected skill instructions",
      sourceVersion: compactText(skill.skill_revision_id, 120),
      activationRoute,
      activationReason,
    });
  }
}

function classifyFixedTool(toolName: RetrievalToolName): Omit<RuntimeContextManifestTool, "name" | "source"> {
  if (PRODUCT_DOC_TOOL_NAMES.has(toolName)) {
    return { family: "product_docs", grantedBy: "product_docs_capability", effect: "read" };
  }
  if (COMMUNITY_CONTEXT_TOOL_NAMES.has(toolName)) {
    return { family: "community_context", grantedBy: "validated_community_lens", effect: "read" };
  }
  if (MEMBER_CONVERSATION_TOOL_NAMES.has(toolName)) {
    return { family: "member_conversations", grantedBy: "authenticated_member_owner_scope", effect: "read" };
  }
  if (COMMUNITY_DIRECTORY_TOOL_NAMES.has(toolName)) {
    return {
      family: "community_directory",
      grantedBy: "authenticated_member_per_call_access_resolution",
      effect: "read",
    };
  }
  if (COMMUNITY_RESOURCE_TOOL_NAMES.has(toolName)) {
    const isWrite =
      toolName === "community_resource_builder_stage_changeset" ||
      toolName === "community_resource_builder_apply_changeset";
    return {
      family: "community_resources",
      grantedBy: "validated_community_resource_lane",
      effect: isWrite ? "write" : "read",
    };
  }
  if (COMMUNITY_MEMORY_TOOL_NAMES.has(toolName)) {
    return { family: "community_memory", grantedBy: "validated_community_lens", effect: "read" };
  }
  if (COMMUNITY_ACTIVITY_TOOL_NAMES.has(toolName)) {
    return { family: "community_activity", grantedBy: "validated_community_lens", effect: "read" };
  }
  if (COMMUNITY_WRITE_TOOL_NAMES.has(toolName)) {
    return { family: "community_write", grantedBy: "validated_community_lens", effect: "write" };
  }
  if (MEMBER_PROFILE_WRITE_TOOL_NAMES.has(toolName)) {
    return {
      family: "member_profile",
      grantedBy: "explicit_profile_confirmation_flow",
      effect: "write",
    };
  }
  if (WEB_RESEARCH_TOOL_NAMES.has(toolName)) {
    return { family: "web_research", grantedBy: "web_research_capability", effect: "external" };
  }
  if (SANDBOX_READ_TOOL_NAMES.has(toolName)) {
    return { family: "sandbox_read", grantedBy: "authenticated_sandbox_scope", effect: "read" };
  }
  if (SANDBOX_WRITE_TOOL_NAMES.has(toolName)) {
    return { family: "sandbox_write", grantedBy: "authenticated_sandbox_scope", effect: "write" };
  }
  if (TERMINAL_TOOL_NAMES.has(toolName)) {
    return { family: "terminal_control", grantedBy: "project_workspace_scope", effect: "process" };
  }
  if (isComputerUseToolName(toolName)) {
    return { family: "computer_control", grantedBy: "eligible_workspace_runtime", effect: "ui" };
  }
  return { family: "unknown", grantedBy: "runtime_tool_policy", effect: "read" };
}

function hasAnyTool(
  allowedToolNames: readonly RetrievalToolName[],
  names: ReadonlySet<RetrievalToolName>,
): boolean {
  return allowedToolNames.some((toolName) => names.has(toolName));
}

function buildPromptEntries(params: BuildRuntimeContextManifestInput & {
  resourceLane: CommunityResourceRuntimeLaneState;
}): RuntimeContextManifestPrompt[] {
  const prompts: RuntimeContextManifestPrompt[] = [
    {
      id: "platform_doctrine",
      owner: "platform",
      authority: "platform",
      injected: true,
      source: "shared/runtimePrompt.ts",
      reason: "always-on platform product and safety authority",
    },
    {
      id: "agent_soul",
      owner: "platform",
      authority: "platform",
      injected: true,
      source: "shared/runtimePrompt.ts",
      reason: "agent posture and identity",
    },
    {
      id: "explanation_contract",
      owner: "runtime",
      authority: "runtime",
      injected: true,
      source: "shared/runtimePrompt.ts",
      reason: "communication and uncertainty policy",
    },
    {
      id: "harness_operating_policy",
      owner: "runtime",
      authority: "runtime",
      injected: true,
      source: "shared/runtimePrompt.ts",
      reason: "tool-use and loop behavior policy",
    },
  ];
  if (hasText(params.agentSoul)) {
    prompts.push({
      id: "user_agent_soul",
      owner: "user",
      authority: "scoped",
      injected: true,
      source: "shared/runtimePrompt.ts",
      reason: "member-configured agent posture",
    });
  }
  if (params.invocationSurface === "member_agent_dock") {
    prompts.push({
      id: "invocation_surface",
      owner: "runtime",
      authority: "runtime",
      injected: true,
      source: "shared/runtimeInvocationSurface.ts",
      reason: "member-owned private agent surface boundary",
    });
  }
  if (params.memberAgentSurfaceContext) {
    prompts.push({
      id: "current_surface",
      owner: "runtime",
      authority: "scoped",
      injected: true,
      source: "shared/memberAgentSurfaceContext.ts",
      reason: "bounded current-page orientation without capability authority",
    });
  }
  if (hasMemberIdentityContext(params)) {
    prompts.push({
      id: "member_identity_context",
      owner: "user",
      authority: "scoped",
      injected: true,
      source: "shared/memberAgentIdentityContext.ts",
      reason: "bounded deterministic member identity context",
    });
  }
  if (hasText(params.communityId)) {
    prompts.push({
      id: "community_lens",
      owner: "community",
      authority: "scoped",
      injected: true,
      source: "shared/runtimePrompt.ts",
      reason: "server-validated community scope and compact identity",
    });
  }
  if (hasText(params.communitySystemPrompt)) {
    prompts.push({
      id: "community_system_prompt",
      owner: "community",
      authority: "scoped",
      injected: true,
      source: "shared/runtimePrompt.ts",
      reason: "community owner/admin instructions under platform policy",
    });
  }
  if (params.resourceLane.lane !== "none") {
    prompts.push({
      id: `community_resource_lane:${params.resourceLane.lane}`,
      owner: "community",
      authority: "workflow",
      injected: true,
      source: "shared/runtimePrompt.ts",
      reason: "community resource lane behavior",
    });
  }
  if (hasText(params.projectId)) {
    prompts.push({
      id: "workspace_project_context",
      owner: "workspace",
      authority: "scoped",
      injected: true,
      source: "shared/runtimePrompt.ts",
      reason: "project-bound workspace context",
    });
  }
  if (params.hasBrowserBuiltDemoPrompt === true) {
    prompts.push({
      id: "browser_demo_prompt",
      owner: "runtime",
      authority: "demo",
      injected: true,
      source: "browser_demo_lane",
      reason: "anonymous demo-only prompt authority",
    });
  }
  pushSelectedSkillPrompts({
    prompts,
    scope: "platform",
    owner: "platform",
    skills: params.selectedPlatformSkills,
  });
  pushSelectedSkillPrompts({
    prompts,
    scope: "personal",
    owner: "user",
    skills: params.selectedPersonalSkills,
  });
  pushSelectedSkillPrompts({
    prompts,
    scope: "community",
    owner: "community",
    skills: params.selectedCommunitySkills,
  });
  return prompts;
}

function buildResourceEntries(params: BuildRuntimeContextManifestInput & {
  allowedToolNames: RetrievalToolName[];
  resourceLane: CommunityResourceRuntimeLaneState;
}): RuntimeContextManifestResource[] {
  const resources: RuntimeContextManifestResource[] = [];
  if (hasMemberIdentityContext(params)) {
    resources.push({
      id: "member_identity_context",
      owner: "user",
      retrieval: "injected_excerpt",
      visibility: "private",
      source: "profiles.resolveMemberAgentIdentityContextInternal",
      reason: "deterministic account identity for the member's private agent",
    });
  }
  if (hasAnyTool(params.allowedToolNames, MEMBER_CONVERSATION_TOOL_NAMES)) {
    resources.push({
      id: "member_conversations",
      owner: "user",
      retrieval: "tool_available",
      visibility: "private",
      source: "member_conversations_list/member_conversation_read",
      reason: "the member's private episodes are retrievable on demand across community lenses",
    });
  }
  if (hasAnyTool(params.allowedToolNames, COMMUNITY_DIRECTORY_TOOL_NAMES)) {
    resources.push({
      id: "community_directory",
      owner: "platform",
      retrieval: "tool_available",
      visibility: "member",
      source: "polynet_list_communities/polynet_get_community",
      reason: "bounded joined and public Discover community context is retrievable without changing the active lens",
    });
  }
  if (hasAnyTool(params.allowedToolNames, PRODUCT_DOC_TOOL_NAMES)) {
    resources.push({
      id: "product_docs",
      owner: "platform",
      retrieval: "tool_available",
      visibility: "public",
      source: "search_product_docs/get_product_doc",
      reason: "platform product truth is retrievable on demand",
    });
  }
  if (hasText(params.communityId)) {
    resources.push({
      id: "community_identity_excerpt",
      owner: "community",
      retrieval: "injected_excerpt",
      visibility: "member",
      source: "community_lens_prompt",
      reason: "compact active community identity",
    });
  }
  if (hasText(params.communityAbout)) {
    resources.push({
      id: "community_about_excerpt",
      owner: "community",
      retrieval: "injected_excerpt",
      visibility: "member",
      source: "community_lens_prompt",
      reason: "bounded community about text",
    });
  }
  if (hasAnyTool(params.allowedToolNames, COMMUNITY_CONTEXT_TOOL_NAMES)) {
    resources.push({
      id: "active_community_context",
      owner: "community",
      retrieval: "tool_available",
      visibility: "member",
      source: "polynet_list/polynet_read",
      reason: "permission-filtered platform semantic repository with exact active-community paths",
    });
  }
  if (hasAnyTool(params.allowedToolNames, COMMUNITY_RESOURCE_TOOL_NAMES)) {
    resources.push({
      id: "community_resources",
      owner: "community",
      retrieval: "tool_available",
      visibility: params.resourceLane.lane === "builder" ? "owner" : "member",
      source: "community_resource_tools",
      reason: "community wiki/resources/source material",
    });
  }
  if (hasAnyTool(params.allowedToolNames, COMMUNITY_MEMORY_TOOL_NAMES)) {
    resources.push({
      id: "community_compiled_memory",
      owner: "community",
      retrieval: "tool_available",
      visibility: "member",
      source: "community_memory_search/community_memory_read",
      reason: "accepted community intelligence learned by the compiler and steward",
    });
  }
  if (hasAnyTool(params.allowedToolNames, COMMUNITY_ACTIVITY_TOOL_NAMES)) {
    resources.push({
      id: "community_activity_archive",
      owner: "community",
      retrieval: "tool_available",
      visibility: "member",
      source: "community_search",
      reason: "raw/recent community activity evidence",
    });
  }
  if (hasAnyTool(params.allowedToolNames, WEB_RESEARCH_TOOL_NAMES)) {
    resources.push({
      id: "web_external_evidence",
      owner: "web",
      retrieval: "tool_available",
      visibility: "public",
      source: "web_research/web_crawl",
      reason: "external web evidence on demand",
    });
  }
  if (
    hasAnyTool(params.allowedToolNames, SANDBOX_READ_TOOL_NAMES) ||
    hasAnyTool(params.allowedToolNames, SANDBOX_WRITE_TOOL_NAMES)
  ) {
    resources.push({
      id: "workspace_files",
      owner: "workspace",
      retrieval: "tool_available",
      visibility: "private",
      source: "sandbox_file_tools",
      reason: "private sandbox filesystem evidence and edit substrate",
    });
  }
  if (params.runtimeTurnContext?.activeBackgroundTerminals?.length) {
    resources.push({
      id: "background_terminal_output",
      owner: "workspace",
      retrieval: "runtime_fragment",
      visibility: "private",
      source: "runtime_context_fragments",
      reason: "bounded operational terminal evidence",
    });
  }
  return resources;
}

function buildToolEntries(params: BuildRuntimeContextManifestInput & {
  allowedToolNames: RetrievalToolName[];
}): RuntimeContextManifestTool[] {
  const tools: RuntimeContextManifestTool[] = params.allowedToolNames.map((toolName) => ({
    name: toolName,
    source: "fixed_runtime_tool",
    ...classifyFixedTool(toolName),
  }));
  return tools;
}

function buildRuntimeStateEntries(params: BuildRuntimeContextManifestInput): RuntimeContextManifestRuntimeState[] {
  const packet = params.runtimeTurnContext;
  const state: RuntimeContextManifestRuntimeState[] = [];
  const identityStatus = resolveMemberIdentityContextStatus(params);
  state.push({
    id: "member_identity_context",
    kind: "private_profile_projection",
    status: identityStatus,
    rendered: identityStatus === "loaded",
    redacted: true,
    source: "profiles.resolveMemberAgentIdentityContextInternal",
    reason: "private deterministic identity projection status",
  });
  if (params.runtimeTurnEnvelope) {
    state.push({
      id: "runtime_turn_envelope",
      kind: "turn_envelope",
      rendered: true,
      redacted: false,
      source: "shared/runtimeTurnEnvelope.ts",
      reason: "compact request/scope/tool orientation",
    });
  }
  if (packet?.threadWorkingState) {
    state.push({
      id: "thread_working_state",
      kind: "working_state",
      rendered: true,
      redacted: false,
      source: "shared/runtimeTurnContextPacket.ts",
      reason: "turn continuity state",
    });
  }
  if (packet?.fragments?.some((fragment) => fragment.kind === "action_ledger")) {
    state.push({
      id: "action_ledger",
      kind: "action_ledger",
      rendered: true,
      redacted: true,
      source: "shared/runtimeContextFragments.ts",
      reason: "recent runtime action continuity",
    });
  }
  if (packet?.activeBackgroundTerminals?.length) {
    state.push({
      id: "active_background_terminals",
      kind: "active_terminals",
      rendered: true,
      redacted: true,
      source: "shared/runtimeTurnContextPacket.ts",
      reason: "running process awareness",
    });
  }
  if (packet?.recentBackgroundProcessEvents?.length) {
    state.push({
      id: "recent_background_process_events",
      kind: "recent_background_process_events",
      rendered: true,
      redacted: true,
      source: "shared/runtimeTurnContextPacket.ts",
      reason: "bounded recent process events",
    });
  }
  if (packet?.recentToolAttempts?.length) {
    state.push({
      id: "recent_tool_attempts",
      kind: "recent_tool_attempts",
      rendered: true,
      redacted: true,
      source: "shared/runtimeTurnContextPacket.ts",
      reason: "avoid repeated failed tool calls",
    });
  }
  if (packet?.runtimeStop) {
    state.push({
      id: "runtime_stop",
      kind: "runtime_stop",
      rendered: true,
      redacted: true,
      source: "shared/runtimeTurnContextPacket.ts",
      reason: "runtime cancellation/error explanation",
    });
  }
  state.push({
    id: "temporal_context",
    kind: "temporal_context",
    rendered: true,
    redacted: false,
    source: "shared/runtimePrompt.ts",
    reason: "current runtime date/time/time zone",
  });
  return state;
}

function buildExclusions(params: BuildRuntimeContextManifestInput & {
  allowedToolNames: RetrievalToolName[];
}): RuntimeContextManifestExclusion[] {
  const exclusions: RuntimeContextManifestExclusion[] = [
    {
      source: "provider_credentials",
      reason: "secrets never enter prompt context",
    },
    {
      source: "client_system_messages_authenticated",
      reason: "authenticated server runtime strips client/system-role messages",
    },
    {
      source: "unvalidated_scope_selectors",
      reason: "client community/user/project selectors are not authority",
    },
    {
      source: "raw_unbounded_archives",
      reason: "large/private/dynamic archives must be retrieved through bounded tools",
    },
    {
      source: "payment_redirects",
      reason: "provider/webhook state, not redirect UX, is authoritative",
    },
    {
      source: "tool_balance_as_doctrine",
      reason: "balance state gates execution but is not prompt authority",
    },
    {
      source: "message_attachments",
      reason: "attachments are not auto-injected unless an explicit parser or reader participates",
    },
  ];
  if (!hasText(params.communityId)) {
    exclusions.push({
      source: "community_lens",
      reason: "no server-validated community scope for this turn",
    });
  }
  if (!hasText(params.projectId)) {
    exclusions.push({
      source: "workspace_project_context",
      reason: "no active project scope for this turn",
    });
  }
  return exclusions;
}

export function buildRuntimeContextManifest(
  input: BuildRuntimeContextManifestInput,
): RuntimeContextManifestV1 {
  const allowedToolNames = uniqueToolNames(input.allowedToolNames);
  const resourceLane = input.communityResourceLane
    ? normalizeCommunityResourceRuntimeLaneState(input.communityResourceLane)
    : EMPTY_COMMUNITY_RESOURCE_RUNTIME_LANE;
  const manifestBase = {
    ...input,
    allowedToolNames,
    resourceLane,
  };
  const prompts = buildPromptEntries(manifestBase);
  const resources = buildResourceEntries(manifestBase);
  const tools = buildToolEntries(manifestBase);
  const runtimeState = buildRuntimeStateEntries(input);
  const exclusions = buildExclusions(manifestBase);
  const latestUserText =
    compactText(input.latestUserText, 500) ??
    compactText(input.runtimeTurnEnvelope?.currentRequest, 500);
  const conversationMessageCount = Array.isArray(input.messages)
    ? input.messages.length
    : 0;

  return {
    version: 1,
    generatedAt: compactText(input.generatedAt, 80),
    scope: {
      userId: compactText(input.userId, 160),
      threadId: compactText(input.threadId, 160),
      communityId: compactText(input.communityId, 160),
      communityContextVersion:
        typeof input.communityContextVersion === "number" &&
        Number.isFinite(input.communityContextVersion)
          ? input.communityContextVersion
          : null,
      projectId: compactText(input.projectId, 160),
      resourceLane: resourceLane.lane,
      harnessName: compactText(input.harnessName, 80),
      inferenceSource: compactText(input.inferenceSource, 80),
      memberAgentSurfaceContext: normalizeMemberAgentSurfaceContext(
        input.memberAgentSurfaceContext,
      ),
    },
    request: {
      latestUserText,
      conversationMessageCount,
      hasUserRequest: Boolean(latestUserText),
    },
    prompts,
    resources,
    tools,
    runtimeState,
    exclusions,
    summary: {
      promptCount: prompts.length,
      resourceCount: resources.length,
      toolCount: tools.length,
      runtimeStateCount: runtimeState.length,
      exclusionCount: exclusions.length,
      fixedToolCount: allowedToolNames.length,
    },
  };
}
