import {
  hasBuilderTierPaidAccess,
  isBuilderTierArchitect,
  isBuilderTierBuilder,
  isBuilderTierFree,
} from "./builderBilling";
import {
  evaluateCanonicalGate,
  resolveEffectiveTierForGate,
} from "./canonicalGateEngine.mjs";

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

const loggedGateParityMismatches = new Set<string>();

function normalizeBuilderTier(value: string | null | undefined): BuilderTier {
  if (isBuilderTierArchitect(value)) return "pro";
  if (isBuilderTierBuilder(value)) return "builder";
  if (isBuilderTierFree(value)) return "free";
  return "unknown";
}

function isPaidBuilderTier(value: string | null | undefined): boolean {
  return hasBuilderTierPaidAccess(value);
}

export function resolveUserAccessPolicy(input: {
  surface: AccessSurface;
  authState: AccessAuthState;
  builderTier?: string | null;
  hasDesktopChatgptAuth?: boolean;
  useCanonicalGates?: boolean;
  enableCanonicalGateParityLog?: boolean;
}): UserAccessPolicy {
  const legacyPolicy = resolveUserAccessPolicyLegacy(input);
  const shouldEvalCanonical = Boolean(input.useCanonicalGates || input.enableCanonicalGateParityLog);
  const canonicalPolicy = shouldEvalCanonical ? resolveUserAccessPolicyViaCanonicalGate(input) : null;

  if (input.enableCanonicalGateParityLog && canonicalPolicy) {
    maybeLogGateParityMismatch({
      input,
      legacy: legacyPolicy,
      canonical: canonicalPolicy,
    });
  }

  if (input.useCanonicalGates) {
    return canonicalPolicy ?? legacyPolicy;
  }

  return legacyPolicy;
}

function resolveUserAccessPolicyLegacy(input: {
  surface: AccessSurface;
  authState: AccessAuthState;
  builderTier?: string | null;
}): UserAccessPolicy {

  const tier = normalizeBuilderTier(input.builderTier);
  const isAuthenticated = input.authState === "authenticated";
  const isPaid = isAuthenticated && isPaidBuilderTier(tier);

  if (!isAuthenticated) {
    if (input.surface === "web") {
      return {
        surface: input.surface,
        authState: input.authState,
        tier: "unknown",
        isPaid: false,
        threadMode: "single_guest",
        allowMultipleThreads: false,
        allowPlatformInference: false,
        allowGuestInference: true,
        allowCommunityJoin: false,
        allowCommunityCreate: false,
        allowPersonalMemory: false,
      };
    }
    return {
      surface: input.surface,
      authState: input.authState,
      tier: "unknown",
      isPaid: false,
      threadMode: "multi_local",
      allowMultipleThreads: true,
      allowPlatformInference: false,
      allowGuestInference: true,
      allowCommunityJoin: false,
      allowCommunityCreate: false,
      allowPersonalMemory: false,
    };
  }

  return {
    surface: input.surface,
    authState: input.authState,
    tier,
    isPaid,
    threadMode: input.surface === "web" ? "multi_cloud" : "multi_local",
    allowMultipleThreads: true,
    allowPlatformInference: isPaid,
    allowGuestInference: true,
    allowCommunityJoin: true,
    allowCommunityCreate: isPaid,
    allowPersonalMemory: isPaid,
  };
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
    modelClass: "paid_model",
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
    allowPlatformInference: paidModelDecision.allowed && paidModelDecision.lane === "platform",
    allowGuestInference: true,
    allowCommunityJoin: isAuthenticated,
    allowCommunityCreate: isPaid,
    allowPersonalMemory: isPaid,
  };
}

function pickComparablePolicyFields(policy: UserAccessPolicy) {
  return {
    tier: policy.tier,
    isPaid: policy.isPaid,
    threadMode: policy.threadMode,
    allowMultipleThreads: policy.allowMultipleThreads,
    allowPlatformInference: policy.allowPlatformInference,
    allowGuestInference: policy.allowGuestInference,
    allowCommunityJoin: policy.allowCommunityJoin,
    allowCommunityCreate: policy.allowCommunityCreate,
    allowPersonalMemory: policy.allowPersonalMemory,
  };
}

function maybeLogGateParityMismatch(args: {
  input: {
    surface: AccessSurface;
    authState: AccessAuthState;
    builderTier?: string | null;
    hasDesktopChatgptAuth?: boolean;
  };
  legacy: UserAccessPolicy;
  canonical: UserAccessPolicy;
}): void {
  const left = pickComparablePolicyFields(args.legacy);
  const right = pickComparablePolicyFields(args.canonical);
  const leftJson = JSON.stringify(left);
  const rightJson = JSON.stringify(right);
  if (leftJson === rightJson) return;

  const signature = JSON.stringify({
    surface: args.input.surface,
    authState: args.input.authState,
    builderTier: String(args.input.builderTier ?? "null"),
    hasDesktopChatgptAuth: Boolean(args.input.hasDesktopChatgptAuth),
    legacy: left,
    canonical: right,
  });
  if (loggedGateParityMismatches.has(signature)) return;
  loggedGateParityMismatches.add(signature);

  // Keep this warning high-signal and deduped so we can fix parity before flipping defaults.
  console.warn("[gate-parity-v1] Legacy/canonical policy mismatch", {
    input: {
      surface: args.input.surface,
      authState: args.input.authState,
      builderTier: args.input.builderTier ?? null,
      hasDesktopChatgptAuth: Boolean(args.input.hasDesktopChatgptAuth),
    },
    legacy: left,
    canonical: right,
  });
}
