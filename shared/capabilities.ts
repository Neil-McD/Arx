import {
  resolveCanonicalGatePolicy,
} from "./canonicalGateEngine";

export type AccessSurface = "web";
export type AccessAuthState = "anonymous" | "authenticated";
export type AccountTier = "free" | "architect" | "unknown";
export type ThreadMode = "single_guest" | "multi_cloud";

export type UserAccessPolicy = {
  surface: AccessSurface;
  authState: AccessAuthState;
  tier: AccountTier;
  threadMode: ThreadMode;
  allowMultipleThreads: boolean;
  allowGuestInference: boolean;
  allowProductDocs: boolean;
  allowCommunityTools: boolean;
  allowWebResearch: boolean;
  allowSandboxTools: boolean;
  allowWorkspaceTools: boolean;
  allowCommunityJoin: boolean;
  allowCommunityCreate: boolean;
  allowPersonalMemory: boolean;
};

export function resolveUserAccessPolicy(input: {
  surface: "web";
  authState: AccessAuthState;
  accountTier?: string | null;
  userEmail?: string | null;
  hasUserChatGptConnection?: boolean;
}): UserAccessPolicy {
  return resolveUserAccessPolicyViaCanonicalGate(input);
}

function resolveUserAccessPolicyViaCanonicalGate(input: {
  surface: "web";
  authState: AccessAuthState;
  accountTier?: string | null;
  userEmail?: string | null;
  hasUserChatGptConnection?: boolean;
}): UserAccessPolicy {
  const policy = resolveCanonicalGatePolicy({
    surface: input.surface,
    authState: input.authState,
    tier: input.accountTier ?? null,
    executionMode: "cloud",
    requestedFundingSource: "demo_public",
  });
  const effectiveTier = policy.decision.effectiveTier;

  const isAnonymous = effectiveTier === "anon_free";
  const isAuthenticated = !isAnonymous;

  const tier: AccountTier = isAnonymous
    ? "unknown"
    : effectiveTier === "architect"
      ? effectiveTier
      : "free";

  const threadMode: ThreadMode = isAuthenticated ? "multi_cloud" : "single_guest";
  const entitledCapabilityFamilies = policy.entitledCapabilityFamilies;
  const canCreateCommunityInAlpha = isAuthenticated;

  return {
    surface: input.surface,
    authState: input.authState,
    tier,
    threadMode,
    allowMultipleThreads: threadMode !== "single_guest",
    allowGuestInference: true,
    allowProductDocs: entitledCapabilityFamilies.includes("product_docs"),
    allowCommunityTools: entitledCapabilityFamilies.includes("community_tools"),
    allowWebResearch: entitledCapabilityFamilies.includes("web_research"),
    allowSandboxTools: entitledCapabilityFamilies.includes("sandbox_tools"),
    allowWorkspaceTools: entitledCapabilityFamilies.includes("workspace_tools"),
    allowCommunityJoin: isAuthenticated,
    allowCommunityCreate: canCreateCommunityInAlpha,
    allowPersonalMemory: isAuthenticated,
  };
}
