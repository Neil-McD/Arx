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
  allowByokLocalStore: boolean;
  allowByokCloudStore: boolean;
  allowPlatformInference: boolean;
  allowGuestInference: boolean;
  allowCommunityJoin: boolean;
  allowCommunityCreate: boolean;
  allowPersonalMemory: boolean;
};

const BYOK_ENABLED = false;

export function normalizeBuilderTier(value: string | null | undefined): BuilderTier {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (raw === "builder" || raw === "pro" || raw === "free") return raw;
  return "unknown";
}

export function resolveUserAccessPolicy(input: {
  surface: AccessSurface;
  authState: AccessAuthState;
  builderTier?: string | null;
}): UserAccessPolicy {
  const tier = normalizeBuilderTier(input.builderTier);
  const isAuthenticated = input.authState === "authenticated";
  const isPaid = isAuthenticated && (tier === "builder" || tier === "pro");

  if (!isAuthenticated) {
    if (input.surface === "web") {
      return {
        surface: input.surface,
        authState: input.authState,
        tier: "unknown",
        isPaid: false,
        threadMode: "single_guest",
        allowMultipleThreads: false,
        allowByokLocalStore: false,
        allowByokCloudStore: false,
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
      allowByokLocalStore: false,
      allowByokCloudStore: false,
      allowPlatformInference: false,
      allowGuestInference: false,
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
    allowByokLocalStore: BYOK_ENABLED && input.surface === "desktop",
    allowByokCloudStore: BYOK_ENABLED,
    allowPlatformInference: isPaid,
    allowGuestInference: false,
    allowCommunityJoin: true,
    allowCommunityCreate: isPaid,
    allowPersonalMemory: isPaid,
  };
}
