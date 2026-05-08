import { buildAccountSetupStatus, type AccountSetupStatus } from "../shared/accountSetup";

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
  return buildAccountSetupStatus({
    displayName: params.user.displayName ?? null,
    handle: params.user.handle ?? null,
    avatarUrl: params.user.avatarUrl ?? null,
    bio: params.detail?.bio ?? null,
    hasInferenceProvider,
    agentName: params.memorySettings?.agentName ?? null,
    agentSoul: params.memorySettings?.agentSoul ?? null,
    onboardingDirection: params.detail?.onboardingDirection ?? null,
  });
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
