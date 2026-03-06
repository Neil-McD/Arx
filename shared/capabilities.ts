import {
  evaluateCanonicalGate,
  resolveEffectiveTierForGate,
} from "./canonicalGateEngine";

export type AccessSurface = "web" | "desktop";
export type AccessAuthState = "anonymous" | "authenticated";
export type BuilderTier = "free" | "builder" | "pro" | "unknown";
export type ThreadMode = "single_guest" | "multi_local" | "multi_cloud";

export type UserAccessPolicy = {
  surface: AccessSurface;
  authState: AccessAuthState;
  tier: BuilderTier;
  isPaid: boolean;
  threadMode: ThreadMode;
  allowMultipleThreads: boolean;
  allowPlatformInference: boolean;
  allowGuestInference: boolean;
  allowCommunityJoin: boolean;
  allowCommunityCreate: boolean;
  allowPersonalMemory: boolean;
};

export function resolveUserAccessPolicy(input: {
  surface: AccessSurface;
  authState: AccessAuthState;
  builderTier?: string | null;
  hasDesktopChatgptAuth?: boolean;
}): UserAccessPolicy {
  return resolveUserAccessPolicyViaCanonicalGate(input);
}

function resolveUserAccessPolicyViaCanonicalGate(input: {
  surface: AccessSurface;
  authState: AccessAuthState;
  builderTier?: string | null;
  hasDesktopChatgptAuth?: boolean;
}): UserAccessPolicy {
  const paidModelDecision = evaluateCanonicalGate({
    surface: input.surface,
    executionMode: "cloud",
    turnClass: "chat_only",
    requestedFundingSource: "platform",
    authState: input.authState,
    tier: input.builderTier ?? null,
    hasDesktopChatGptAuth: Boolean(input.hasDesktopChatgptAuth),
  });

  const effectiveTier = resolveEffectiveTierForGate({
    authState: input.authState,
    tier: input.builderTier ?? null,
  });

  const isAnonymous = effectiveTier === "anon_free";
  const isAuthenticated = !isAnonymous;
  const isPaid = effectiveTier === "builder" || effectiveTier === "architect";

  const tier: BuilderTier = isAnonymous
    ? "unknown"
    : effectiveTier === "builder"
      ? "builder"
      : effectiveTier === "architect"
        ? "pro"
        : "free";

  const threadMode: ThreadMode = !isAuthenticated
    ? input.surface === "web"
      ? "single_guest"
      : "multi_local"
    : input.surface === "web"
      ? "multi_cloud"
      : "multi_local";

  return {
    surface: input.surface,
    authState: input.authState,
    tier,
    isPaid,
    threadMode,
    allowMultipleThreads: threadMode !== "single_guest",
    allowPlatformInference:
      paidModelDecision.allowed &&
      paidModelDecision.lane === "platform" &&
      paidModelDecision.fundingSource === "platform",
    allowGuestInference: true,
    allowCommunityJoin: isAuthenticated,
    allowCommunityCreate: isPaid,
    allowPersonalMemory: isPaid,
  };
}
