import {
  buildAccountSetupStatus,
  isAccountSetupIdentityComplete,
  type AccountSetupStatus,
} from "../shared/accountSetup";
import type { SocialProfileLinks } from "../shared/socialProfileLinks";
import {
  hasAcceptedCurrentPlatformLegalFromRows,
  listPlatformLegalAcceptancesForUser,
} from "./legalAcceptances";
import { getUniqueUserProfileDetailByUserId } from "./profileCore";

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
  socialLinks?: SocialProfileLinks;
  onboardingCompletedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type AccountSetupProviderConnectionRow = {
  userId: any;
  provider?: string;
};

export type AccountSetupLegalAcceptanceRow = {
  userId?: any;
  documentKey?: string;
  documentVersion?: string;
};

export function buildAccountSetupStatusForRows(params: {
  user: AccountSetupUserRow;
  detail: AccountSetupProfileDetailRow | null;
  providerConnections: AccountSetupProviderConnectionRow[];
  legalAcceptances?: AccountSetupLegalAcceptanceRow[];
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
    hasAcceptedPlatformLegal: hasAcceptedCurrentPlatformLegalFromRows(params.legalAcceptances ?? []),
    bio: params.detail?.bio ?? null,
    hasInferenceProvider,
  });
}

export function isProfileSetupCompleteForRows(
  user: AccountSetupUserRow | null,
  detail: AccountSetupProfileDetailRow | null,
  legalAcceptances: AccountSetupLegalAcceptanceRow[] = [],
): boolean {
  return isAccountSetupIdentityComplete({
    displayName: detail?.displayName ?? null,
    handle: user?.handle ?? null,
    avatarUrl: detail?.avatarUrl ?? null,
    avatarStorageId: detail?.avatarStorageId ? String(detail.avatarStorageId) : null,
    hasAcceptedPlatformLegal: hasAcceptedCurrentPlatformLegalFromRows(legalAcceptances),
  });
}

export async function requireProfileSetupCompleteForUser(ctx: any, userId: any): Promise<void> {
  const [user, detail, legalAcceptances] = (await Promise.all([
    ctx.db.get(userId),
    getUniqueUserProfileDetailByUserId<AccountSetupProfileDetailRow>(ctx, userId),
    listPlatformLegalAcceptancesForUser(ctx, userId),
  ])) as [AccountSetupUserRow | null, AccountSetupProfileDetailRow | null, AccountSetupLegalAcceptanceRow[]];
  if (!isProfileSetupCompleteForRows(user, detail, legalAcceptances)) {
    throw new Error("profile_setup_required");
  }
}

export async function loadAccountSetupStatusForUserId(ctx: any, userId: any): Promise<AccountSetupStatus> {
  const [user, detail] = (await Promise.all([
    ctx.db.get(userId),
    getUniqueUserProfileDetailByUserId<AccountSetupProfileDetailRow>(ctx, userId),
  ])) as [AccountSetupUserRow | null, AccountSetupProfileDetailRow | null];
  if (!user) {
    throw new Error("user_not_found");
  }
  return await loadAccountSetupStatusForUser(ctx, user, detail);
}

export async function requireAccountSetupCompleteForUser(ctx: any, userId: any): Promise<void> {
  const status = await loadAccountSetupStatusForUserId(ctx, userId);
  if (!status.completed) {
    throw new Error("account_setup_required");
  }
}

export async function loadAccountSetupStatusForUser(
  ctx: any,
  user: AccountSetupUserRow,
  detail: AccountSetupProfileDetailRow | null,
): Promise<AccountSetupStatus> {
  const [providerConnections, legalAcceptances] = await Promise.all([
    ctx.db.query("userProviderConnections").withIndex("by_user", (q: any) => q.eq("userId", user._id)).collect(),
    listPlatformLegalAcceptancesForUser(ctx, user._id),
  ]);
  return buildAccountSetupStatusForRows({
    user,
    detail,
    providerConnections,
    legalAcceptances,
  });
}
