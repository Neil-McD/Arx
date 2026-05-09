import {
  buildAccountSetupStatus,
  isAccountSetupIdentityComplete,
  type AccountSetupStatus,
} from "../shared/accountSetup";

export type AccountSetupUserRow = {
  _id: any;
  authSubject: string;
  email?: string;
  displayName?: string;
  handle?: string;
  normalizedHandle?: string;
  avatarUrl?: string;
  createdAt: number;
  updatedAt: number;
};

export type AccountSetupProfileDetailRow = {
  _id: any;
  userId: any;
  displayName?: string;
  avatarUrl?: string;
  avatarStorageId?: any;
  avatarFocusX?: number;
  avatarFocusY?: number;
  avatarZoom?: number;
  bio?: string;
  onboardingDirection?: "build_community" | "discover_community" | "learn_about_polynet";
  onboardingCompletedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type AccountSetupProviderConnectionRow = {
  userId: any;
  provider?: string;
};

export type AccountSetupMemorySettingsRow = {
  userId: any;
  agentName?: string;
  agentSoul?: string;
};

export function buildAccountSetupStatusForRows(params: {
  user: AccountSetupUserRow;
  detail: AccountSetupProfileDetailRow | null;
  providerConnections: AccountSetupProviderConnectionRow[];
  memorySettings: AccountSetupMemorySettingsRow | null;
}): AccountSetupStatus {
  const hasInferenceProvider = params.providerConnections.some(
    (row) => row?.provider === "chatgpt" || row?.provider === "openai",
  );
  // Account setup requires first-party profile evidence, not auth/provider display fallbacks.
  return buildAccountSetupStatus({
    displayName: params.detail?.displayName ?? null,
    handle: params.user.handle ?? null,
    avatarUrl: params.detail?.avatarUrl ?? null,
    avatarStorageId: params.detail?.avatarStorageId ? String(params.detail.avatarStorageId) : null,
    bio: params.detail?.bio ?? null,
    hasInferenceProvider,
    agentName: params.memorySettings?.agentName ?? null,
    agentSoul: params.memorySettings?.agentSoul ?? null,
    onboardingDirection: params.detail?.onboardingDirection ?? null,
  });
}

export function isProfileSetupCompleteForDetail(detail: AccountSetupProfileDetailRow | null): boolean {
  return isAccountSetupIdentityComplete({
    displayName: detail?.displayName ?? null,
    avatarUrl: detail?.avatarUrl ?? null,
    avatarStorageId: detail?.avatarStorageId ? String(detail.avatarStorageId) : null,
  });
}

export async function requireProfileSetupCompleteForUser(ctx: any, userId: any): Promise<void> {
  const detail = (await ctx.db
    .query("userProfileDetails")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first()) as AccountSetupProfileDetailRow | null;
  if (!isProfileSetupCompleteForDetail(detail)) {
    throw new Error("profile_setup_required");
  }
}

export async function loadAccountSetupStatusForUser(
  ctx: any,
  user: AccountSetupUserRow,
  detail: AccountSetupProfileDetailRow | null,
): Promise<AccountSetupStatus> {
  const [providerConnections, memorySettings] = await Promise.all([
    ctx.db.query("userProviderConnections").withIndex("by_user", (q: any) => q.eq("userId", user._id)).collect(),
    ctx.db.query("userMemorySettings").withIndex("by_user", (q: any) => q.eq("userId", user._id)).first(),
  ]);
  return buildAccountSetupStatusForRows({
    user,
    detail,
    providerConnections,
    memorySettings,
  });
}
