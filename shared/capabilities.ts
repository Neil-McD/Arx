import {
  evaluateCanonicalGate,
  resolveEffectiveTierForGate,
  resolveEntitledCapabilityFamiliesForGate,
} from "./canonicalGateEngine";

export type AccessSurface = "web";
export type AccessAuthState = "anonymous" | "authenticated";
export type BuilderTier = "free" | "builder" | "architect" | "unknown";
export type ThreadMode = "single_guest" | "multi_cloud";

export type UserAccessPolicy = {
  surface: AccessSurface;
  authState: AccessAuthState;
  tier: BuilderTier;
  isPaid: boolean;
  threadMode: ThreadMode;
  allowMultipleThreads: boolean;
  allowPlatformInference: boolean;
  allowGuestInference: boolean;
  allowCommunityTools: boolean;
  allowWebResearch: boolean;
  allowWorkspaceTools: boolean;
  allowCommunityJoin: boolean;
  allowCommunityCreate: boolean;
  allowPersonalMemory: boolean;
};

export function resolveUserAccessPolicy(input: {
  surface: "web";
  authState: AccessAuthState;
  builderTier?: string | null;
  hasUserChatGptConnection?: boolean;
}): UserAccessPolicy {
  return resolveUserAccessPolicyViaCanonicalGate(input);
}

function resolveUserAccessPolicyViaCanonicalGate(input: {
  surface: "web";
  authState: AccessAuthState;
  builderTier?: string | null;
  hasUserChatGptConnection?: boolean;
}): UserAccessPolicy {
  const paidModelDecision = evaluateCanonicalGate({
    surface: input.surface,
    executionMode: "cloud",
    requestedExecutionTarget: "chat",
    requestedFundingSource: "platform",
    authState: input.authState,
    tier: input.builderTier ?? null,
    hasUserChatGptConnection: Boolean(input.hasUserChatGptConnection),
  });

  const effectiveTier = resolveEffectiveTierForGate({
    authState: input.authState,
    tier: input.builderTier ?? null,
  });

  const isAnonymous = effectiveTier === "anon_free";
  const isAuthenticated = !isAnonymous;
  const hasWorkbenchAccess = effectiveTier === "builder" || effectiveTier === "architect";

  const tier: BuilderTier = isAnonymous
    ? "unknown"
    : effectiveTier === "builder" || effectiveTier === "architect"
      ? effectiveTier
      : "free";

  const threadMode: ThreadMode = isAuthenticated ? "multi_cloud" : "single_guest";
  const entitledCapabilityFamilies = resolveEntitledCapabilityFamiliesForGate({
    authState: input.authState,
    tier: input.builderTier ?? null,
  });

  return {
    surface: input.surface,
    authState: input.authState,
    tier,
    isPaid: hasWorkbenchAccess,
    threadMode,
    allowMultipleThreads: threadMode !== "single_guest",
    allowPlatformInference:
      paidModelDecision.allowed &&
      paidModelDecision.lane === "platform" &&
      paidModelDecision.fundingSource === "platform",
    allowGuestInference: true,
    allowCommunityTools: entitledCapabilityFamilies.includes("community_tools"),
    allowWebResearch: entitledCapabilityFamilies.includes("web_research"),
    allowWorkspaceTools: entitledCapabilityFamilies.includes("workspace_tools"),
    allowCommunityJoin: isAuthenticated,
    allowCommunityCreate: effectiveTier === "architect",
    allowPersonalMemory: hasWorkbenchAccess,
  };
}
