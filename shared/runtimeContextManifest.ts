import { type RetrievalToolName } from "./retrievalTools.ts";
import {
  EMPTY_COMMUNITY_RESOURCE_RUNTIME_LANE,
  normalizeCommunityResourceRuntimeLaneState,
  type CommunityResourceRuntimeLaneState,
} from "./communityResourceLane.ts";
import type { RuntimeTurnEnvelopeV1 } from "./runtimeTurnEnvelope.ts";
import type { RuntimeTurnContextPacket } from "./runtimeTurnContextPacket.ts";
import type { RuntimeInvocationSurface } from "./runtimeInvocationSurface.ts";
import type { MemberIdentityContextStatus } from "./communityAgentIdentityContext.ts";
import {
  normalizeCommunityAgentSurfaceContext,
  type CommunityAgentSurfaceContextV1,
} from "./communityAgentSurfaceContext.ts";
import type {
  RuntimePromptSection,
  RuntimePromptSectionAuthority,
  RuntimePromptSectionLayer,
  RuntimePromptSectionOwner,
  RuntimePromptSectionSlot,
} from "./runtimePrompt.ts";

export type RuntimeContextManifestOwner =
  | "platform"
  | "user"
  | "community"
  | "web"
  | "message"
  | "provider"
  | "runtime";

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
  layer: RuntimePromptSectionLayer;
  slot: RuntimePromptSectionSlot;
  owner: RuntimePromptSectionOwner;
  authority: RuntimePromptSectionAuthority;
  injected: boolean;
  chars: number;
  source: string;
  reason: string;
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

export type RuntimeContextManifestV2 = {
  version: 2;
  generatedAt: string | null;
  scope: {
    userId: string | null;
    threadId: string | null;
    communityId: string | null;
    communityContextVersion: number | null;
    resourceLane: CommunityResourceRuntimeLaneState["lane"];
    harnessName: string | null;
    inferenceSource: string | null;
    communityAgentSurfaceContext: CommunityAgentSurfaceContextV1 | null;
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

export type BuildRuntimeContextManifestInput = {
  generatedAt?: string | null;
  userId?: string | null;
  threadId?: string | null;
  communityId?: string | null;
  communityContextVersion?: number | null;
  harnessName?: string | null;
  inferenceSource?: string | null;
  latestUserText?: string | null;
  messages?: Array<{ role?: string | null; content?: string | null }> | null;
  allowedToolNames?: readonly RetrievalToolName[] | null;
  communityResourceLane?: CommunityResourceRuntimeLaneState | null;
  communityAbout?: string | null;
  promptSections: readonly RuntimePromptSection[];
  runtimeTurnEnvelope?: RuntimeTurnEnvelopeV1 | null;
  runtimeTurnContext?: RuntimeTurnContextPacket | null;
  invocationSurface?: RuntimeInvocationSurface | null;
  communityAgentSurfaceContext?: CommunityAgentSurfaceContextV1 | null;
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
  "polynet_search",
]);

const COMMUNITY_CONTEXT_MUTATION_TOOL_NAMES = new Set<RetrievalToolName>([
  "polynet_write",
  "polynet_call",
]);

const MEMBER_CONVERSATION_TOOL_NAMES = new Set<RetrievalToolName>([
  "member_conversations_list",
  "member_conversation_read",
]);

const MEMBER_PROFILE_WRITE_TOOL_NAMES = new Set<RetrievalToolName>([
  "member_profile_confirm_facts",
]);

const WEB_RESEARCH_TOOL_NAMES = new Set<RetrievalToolName>([
  "web_research",
  "web_crawl",
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

function classifyFixedTool(toolName: RetrievalToolName): Omit<RuntimeContextManifestTool, "name" | "source"> {
  if (PRODUCT_DOC_TOOL_NAMES.has(toolName)) {
    return { family: "product_docs", grantedBy: "product_docs_capability", effect: "read" };
  }
  if (COMMUNITY_CONTEXT_TOOL_NAMES.has(toolName)) {
    return { family: "community_context", grantedBy: "validated_community_lens", effect: "read" };
  }
  if (COMMUNITY_CONTEXT_MUTATION_TOOL_NAMES.has(toolName)) {
    return {
      family: "community_context",
      grantedBy: "server_derived_community_authority",
      effect: "write",
    };
  }
  if (MEMBER_CONVERSATION_TOOL_NAMES.has(toolName)) {
    return { family: "member_conversations", grantedBy: "authenticated_member_owner_scope", effect: "read" };
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
  return { family: "unknown", grantedBy: "runtime_tool_policy", effect: "read" };
}

function hasAnyTool(
  allowedToolNames: readonly RetrievalToolName[],
  names: ReadonlySet<RetrievalToolName>,
): boolean {
  return allowedToolNames.some((toolName) => names.has(toolName));
}

function projectCompiledPromptEntries(
  promptSections: readonly RuntimePromptSection[],
): RuntimeContextManifestPrompt[] {
  return promptSections
    .filter((section) => section.rendered)
    .map((section) => ({
      id: section.id,
      layer: section.layer,
      slot: section.slot,
      owner: section.owner,
      authority: section.authority,
      injected: true,
      chars: section.chars,
      source: section.source,
      reason: section.reason,
    }));
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
      source: "profiles.resolveCommunityAgentIdentityContextInternal",
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
    source: "profiles.resolveCommunityAgentIdentityContextInternal",
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
  return exclusions;
}

export function buildRuntimeContextManifest(
  input: BuildRuntimeContextManifestInput,
): RuntimeContextManifestV2 {
  const allowedToolNames = uniqueToolNames(input.allowedToolNames);
  const resourceLane = input.communityResourceLane
    ? normalizeCommunityResourceRuntimeLaneState(input.communityResourceLane)
    : EMPTY_COMMUNITY_RESOURCE_RUNTIME_LANE;
  const manifestBase = {
    ...input,
    allowedToolNames,
    resourceLane,
  };
  const prompts = projectCompiledPromptEntries(input.promptSections);
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
    version: 2,
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
      resourceLane: resourceLane.lane,
      harnessName: compactText(input.harnessName, 80),
      inferenceSource: compactText(input.inferenceSource, 80),
      communityAgentSurfaceContext: normalizeCommunityAgentSurfaceContext(
        input.communityAgentSurfaceContext,
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
