import {
  EMPTY_COMMUNITY_RESOURCE_RUNTIME_LANE,
  normalizeCommunityResourceRuntimeLaneState,
  type CommunityResourceRuntimeLaneState,
} from "./communityResourceLane.ts";
import type { ThreadWorkingStatePrompt } from "./runtimePrompt.ts";

export type RuntimeTurnEnvelopeV1 = {
  version: 1;
  currentRequest: string | null;
  continuityGoal: string | null;
  authority: {
    threadId: string | null;
    communityId: string | null;
    projectId: string | null;
    communityResourceLane: CommunityResourceRuntimeLaneState["lane"];
    allowedToolNames: string[];
  };
  state: {
    currentStep: string | null;
    verified: string[];
    openQuestions: string[];
    nextAction: string | null;
  };
};

function compactText(value: string | null | undefined, limit: number): string | null {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
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

function uniqueToolNames(values: readonly (string | null | undefined)[] | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const toolName = String(value ?? "").trim();
    if (!toolName || seen.has(toolName)) continue;
    seen.add(toolName);
    out.push(toolName);
  }
  return out;
}

export function buildRuntimeTurnEnvelope(params: {
  latestUserText?: string | null;
  threadWorkingState?: ThreadWorkingStatePrompt | null;
  threadId?: string | null;
  communityId?: string | null;
  projectId?: string | null;
  communityResourceLane?: CommunityResourceRuntimeLaneState | null;
  allowedToolNames?: readonly (string | null | undefined)[] | null;
}): RuntimeTurnEnvelopeV1 {
  const allowedToolNames = uniqueToolNames(params.allowedToolNames).slice(0, 80);
  const communityResourceLane = params.communityResourceLane
    ? normalizeCommunityResourceRuntimeLaneState(params.communityResourceLane)
    : EMPTY_COMMUNITY_RESOURCE_RUNTIME_LANE;
  const workingState = params.threadWorkingState ?? null;
  const currentRequest = compactText(params.latestUserText, 280);
  return {
    version: 1,
    currentRequest,
    continuityGoal: compactText(workingState?.goal, 280) ?? currentRequest,
    authority: {
      threadId: compactText(params.threadId, 120),
      communityId: compactText(params.communityId, 120),
      projectId: compactText(params.projectId, 120),
      communityResourceLane: communityResourceLane.lane,
      allowedToolNames,
    },
    state: {
      currentStep: compactText(workingState?.currentStep, 220),
      verified: [
        ...compactList(workingState?.verifiedFindings, 5, 180),
        ...compactList(workingState?.completedSteps, 3, 180),
      ].slice(0, 6),
      openQuestions: compactList(workingState?.openQuestions, 4, 180),
      nextAction: compactText(workingState?.nextAction, 220),
    },
  };
}

export function renderRuntimeTurnEnvelopeForPrompt(
  envelope: RuntimeTurnEnvelopeV1 | null | undefined,
): string | null {
  if (!envelope || envelope.version !== 1) return null;
  const authority = envelope.authority;
  const state = envelope.state;
  return [
    "RUNTIME_TURN_ENVELOPE",
    `Current request: ${envelope.currentRequest || "(none)"}`,
    `Continuity goal: ${envelope.continuityGoal || "(none)"}`,
    `Scope: server-validated thread, community, and project context; resource_lane=${authority.communityResourceLane}`,
    `Current step: ${state.currentStep || "(none)"}`,
    `Verified: ${state.verified.length > 0 ? state.verified.join(" | ") : "(none)"}`,
    `Open questions: ${state.openQuestions.length > 0 ? state.openQuestions.join(" | ") : "(none)"}`,
    `Next action: ${state.nextAction || "(none)"}`,
    "Use this as compact orientation for this turn. It does not replace the user request or tool schemas.",
  ].join("\n");
}
