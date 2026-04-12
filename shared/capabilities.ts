import {
  resolveCanonicalGatePolicy,
} from "./canonicalGateEngine";
import { isCreatorDevTierOverrideEmail } from "./devTierOverride";

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
  userEmail?: string | null;
  hasUserChatGptConnection?: boolean;
}): UserAccessPolicy {
  return resolveUserAccessPolicyViaCanonicalGate(input);
}

function resolveUserAccessPolicyViaCanonicalGate(input: {
  surface: "web";
  authState: AccessAuthState;
  builderTier?: string | null;
  userEmail?: string | null;
  hasUserChatGptConnection?: boolean;
}): UserAccessPolicy {
  const policy = resolveCanonicalGatePolicy({
    surface: input.surface,
    authState: input.authState,
    tier: input.builderTier ?? null,
    executionMode: "cloud",
    requestedFundingSource: "demo_public",
  });
  const effectiveTier = policy.decision.effectiveTier;

  const isAnonymous = effectiveTier === "anon_free";
  const isAuthenticated = !isAnonymous;
  const hasWorkbenchAccess = effectiveTier === "builder" || effectiveTier === "architect";

  const tier: BuilderTier = isAnonymous
    ? "unknown"
    : effectiveTier === "builder" || effectiveTier === "architect"
      ? effectiveTier
      : "free";

  const threadMode: ThreadMode = isAuthenticated ? "multi_cloud" : "single_guest";
  const entitledCapabilityFamilies = policy.entitledCapabilityFamilies;
  const canCreateCommunityInAlpha =
    effectiveTier === "architect" && isCreatorDevTierOverrideEmail(input.userEmail ?? null);

  return {
    surface: input.surface,
    authState: input.authState,
    tier,
    isPaid: hasWorkbenchAccess,
    threadMode,
    allowMultipleThreads: threadMode !== "single_guest",
    allowGuestInference: true,
    allowCommunityTools: entitledCapabilityFamilies.includes("community_tools"),
    allowWebResearch: entitledCapabilityFamilies.includes("web_research"),
    allowWorkspaceTools: entitledCapabilityFamilies.includes("workspace_tools"),
    allowCommunityJoin: isAuthenticated,
    allowCommunityCreate: canCreateCommunityInAlpha,
    allowPersonalMemory: hasWorkbenchAccess,
  };
}
