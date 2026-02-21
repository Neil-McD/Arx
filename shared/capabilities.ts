import {
  hasBuilderTierPaidAccess,
  isBuilderTierArchitect,
  isBuilderTierBuilder,
  isBuilderTierFree,
} from "./builderBilling";

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
