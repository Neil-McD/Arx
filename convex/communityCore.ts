import { resolveUserIdForAuthenticatedRequest } from "./authActor";
export { resolveUserIdForAuthenticatedRequest } from "./authActor";

export type CommunityLike = {
  _id: any;
  ownerId: any;
  slug: string;
  name: string;
  oneLiner?: string;
  about?: string;
  avatarUrl?: string;
  avatarStorageId?: any;
  bannerUrl?: string;
  bannerStorageId?: any;
  bannerFocusX?: number;
  bannerFocusY?: number;
  bannerZoom?: number;
  visibility: "published" | "unlisted";
  entryPolicy?: CommunityEntryPolicy;
  createdAt: number;
  updatedAt: number;
};

export type CommunityEntryPolicy = "open" | "approval" | "paid_subscription";
export type CommunityAccessRelation = "visitor" | "pending" | "member" | "moderator" | "admin" | "owner";
export type CommunityPrimaryCta = "open_community" | "join" | "checkout";

export type CommunityMembershipLike = {
  _id: any;
  communityId: any;
  userId: any;
  role: string;
  accessSource?: string;
  pricePointId?: any;
  active?: boolean;
  revokedAt?: number;
  revokedReason?: string;
  createdAt: number;
  updatedAt: number;
};

export type CommunityChatThreadLike = {
  _id: any;
  communityId: any;
  lastSeq: number;
  createdAt: number;
  updatedAt: number;
};

export type CommunityChatMessageLike = {
  _id: any;
  threadId: any;
  seq: number;
  role: "user";
  contentJson: unknown;
  senderUserId?: any;
  replyToMessageId?: any;
  createdAt: number;
  updatedAt: number;
};

export type CommunityMessageReactionLike = {
  _id: any;
  messageId: any;
  userId: any;
  emoji: string;
  createdAt: number;
};

export type CommunityAgentConfigLike = {
  _id: any;
  communityId: any;
  landingJson?: unknown;
  systemPrompt: string;
  createdAt: number;
  updatedAt: number;
};

export type CommunityJoinRequestLike = {
  _id: any;
  communityId: any;
  userId: any;
  status: string;
  message?: string;
  deniedAt?: number;
  reapplyAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type CommunityPricePointLike = {
  _id: any;
  communityId: any;
  billingPeriod: "monthly" | "annual";
  name: string;
  description?: string;
  amountBaseUnits: number;
  currency: string;
  currencyDecimals: number;
  isCurrent: boolean;
  archivedAt?: number;
  providerPriceId?: string;
  createdAt: number;
  updatedAt: number;
};

export type CommunitySubscriptionLike = {
  _id: any;
  communityId: any;
  userId: any;
  membershipId: any;
  pricePointId: any;
  status: "active" | "past_due" | "cancel_at_period_end" | "canceled" | "ended";
  providerSubscriptionId?: string;
  providerCustomerId?: string;
  currentPeriodStartAt?: number;
  currentPeriodEndAt?: number;
  cancelAtPeriodEnd: boolean;
  endedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type CommunityMembershipEntitlementState = {
  isEntitled: boolean;
  accessSource: string | null;
  subscriptionStatus: CommunitySubscriptionLike["status"] | null;
  subscriptionCurrentPeriodEndAt: number | null;
};

export type UserEntitlementLike = {
  _id: any;
  userId: any;
  tier: string;
  startsAt: number;
  endsAt?: number;
  createdAt: number;
  updatedAt: number;
};

type UserLike = {
  _id: any;
  authSubject?: string;
  displayName?: string;
  avatarUrl?: string;
};

export type CommunityMemberSettingsLike = {
  _id: any;
  communityId: any;
  userId: any;
  muted: boolean;
  mutedUntil?: number;
  createdAt: number;
  updatedAt: number;
};

export type CommunityResourceLike = {
  _id: any;
  communityId: any;
  createdByUserId: any;
  type: string;
  title: string;
  bodyMd?: string;
  url?: string;
  fileKey?: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
};

export type PublicPlanSummaryLike = {
  name: string;
  description: string | null;
  amount_base_units: string;
  currency: string;
  currency_decimals: number;
  billing_period: "monthly" | "annual";
};

export function normalizeIdValue(raw: unknown): string {
  return String(raw ?? "").trim();
}

export function toIsoString(value: number): string {
  return new Date(Math.floor(value)).toISOString();
}

export function normalizeBannerFocus(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0.5;
  return Math.max(0, Math.min(1, parsed));
}

export function normalizeBannerZoom(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(2.5, parsed));
}

async function maybeResolveStorageUrl(ctx: any, storageId: any): Promise<string | null> {
  if (!storageId) return null;
  const resolved = await ctx.storage.getUrl(storageId);
  return typeof resolved === "string" && resolved.trim() ? resolved.trim() : null;
}

export async function maybeDeleteStorageAsset(ctx: any, storageId: any): Promise<void> {
  if (!storageId) return;
  try {
    await ctx.storage.delete(storageId);
  } catch {
    // Best-effort cleanup for replaced branding assets.
  }
}

export async function resolveCommunityBrandingFields(
  ctx: any,
  row: CommunityLike,
): Promise<{
  avatar_url: string | null;
  avatar_storage_id: string | null;
  banner_url: string | null;
  banner_storage_id: string | null;
  banner_focus_x: number;
  banner_focus_y: number;
  banner_zoom: number;
}> {
  const [avatarUrl, bannerUrl] = await Promise.all([
    maybeResolveStorageUrl(ctx, row.avatarStorageId),
    maybeResolveStorageUrl(ctx, row.bannerStorageId),
  ]);
  return {
    avatar_url: avatarUrl ?? row.avatarUrl ?? null,
    avatar_storage_id: row.avatarStorageId ? String(row.avatarStorageId) : null,
    banner_url: bannerUrl ?? row.bannerUrl ?? null,
    banner_storage_id: row.bannerStorageId ? String(row.bannerStorageId) : null,
    banner_focus_x: normalizeBannerFocus(row.bannerFocusX),
    banner_focus_y: normalizeBannerFocus(row.bannerFocusY),
    banner_zoom: normalizeBannerZoom(row.bannerZoom),
  };
}

export function parseIsoMs(raw: unknown): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeRole(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

export function normalizeMembershipAccessSource(
  raw: unknown,
): "free_grant" | "manual_grant" | "paid_subscription" | "" {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (
    value === "free_grant" ||
    value === "manual_grant" ||
    value === "paid_subscription"
  ) {
    return value;
  }
  return "";
}

export function normalizeCommunitySubscriptionStatus(
  raw: unknown,
): CommunitySubscriptionLike["status"] | null {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (
    value === "active" ||
    value === "past_due" ||
    value === "cancel_at_period_end" ||
    value === "canceled" ||
    value === "ended"
  ) {
    return value;
  }
  return null;
}

export function normalizeCommunityRoleForOutput(raw: unknown): "admin" | "moderator" | "member" | "" {
  const role = normalizeRole(raw);
  if (role === "admin" || role === "moderator" || role === "member") return role;
  if (role === "mod") return "moderator";
  return "";
}

export function normalizeSlug(raw: unknown): string {
  const slug = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!slug) throw new Error("community_slug_required");
  if (!/^[a-z0-9-]{3,64}$/.test(slug)) throw new Error("community_slug_invalid");
  return slug;
}

export function normalizeName(raw: unknown): string {
  const name = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!name) throw new Error("community_name_required");
  return name.slice(0, 120);
}

export function normalizeVisibility(raw: unknown): "published" | "unlisted" {
  const visibility = String(raw ?? "")
    .trim()
    .toLowerCase();
  return visibility === "unlisted" ? "unlisted" : "published";
}

export function normalizeEntryPolicy(raw: unknown, fallback: CommunityEntryPolicy): CommunityEntryPolicy {
  const entryPolicy = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (
    entryPolicy === "open" ||
    entryPolicy === "approval" ||
    entryPolicy === "paid_subscription"
  ) {
    return entryPolicy;
  }
  return fallback;
}

export function resolveCommunityEntryPolicy(community: Pick<CommunityLike, "entryPolicy">): CommunityEntryPolicy {
  return normalizeEntryPolicy(community.entryPolicy, "approval");
}

export function normalizeOptionalText(raw: unknown, maxLen = 4000): string | undefined {
  const text = String(raw ?? "").trim();
  if (!text) return undefined;
  return text.slice(0, maxLen);
}

export function normalizeOptionalCommunityImageUrl(raw: unknown): string | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return undefined;
  return value.slice(0, 50_000);
}

export function normalizeResourceType(raw: unknown): "post" | "embed" | "link" | "file" {
  const type = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (type === "embed" || type === "link" || type === "file") return type;
  return "post";
}

export function normalizeOptionalUrl(raw: unknown): string | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return undefined;
  return value.slice(0, 4096);
}

export function normalizeOptionalFileKey(raw: unknown): string | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return undefined;
  return value.slice(0, 4096);
}

export function normalizeRoleAssignment(raw: unknown): "admin" | "moderator" | "member" {
  const role = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (role === "admin" || role === "moderator" || role === "member") {
    return role;
  }
  throw new Error("member_role_invalid");
}

export function communityMembershipRowIsActive(membership: CommunityMembershipLike | null | undefined): boolean {
  if (!membership) return false;
  if (membership.active === false) return false;
  if (typeof membership.revokedAt === "number" && membership.revokedAt > 0) return false;
  return true;
}

export function pickMostRelevantCommunityMembership(
  rows: CommunityMembershipLike[] | null | undefined,
): CommunityMembershipLike | null {
  const list = Array.isArray(rows) ? rows.slice() : [];
  if (list.length === 0) return null;
  list.sort((a, b) => {
    const aActive = communityMembershipRowIsActive(a);
    const bActive = communityMembershipRowIsActive(b);
    if (aActive !== bActive) return aActive ? -1 : 1;
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return b.createdAt - a.createdAt;
  });
  return list[0] ?? null;
}

export const COMMUNITY_JOIN_REAPPLY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function resolveCommunityJoinRequestReapplyAtMs(
  request: CommunityJoinRequestLike | null | undefined,
): number | null {
  if (!request) return null;
  const status = String(request.status ?? "").trim().toLowerCase();
  if (status !== "denied") return null;
  if (typeof request.reapplyAt === "number" && Number.isFinite(request.reapplyAt)) {
    return request.reapplyAt;
  }
  const base = typeof request.deniedAt === "number" && Number.isFinite(request.deniedAt)
    ? request.deniedAt
    : typeof request.updatedAt === "number" && Number.isFinite(request.updatedAt)
      ? request.updatedAt
      : null;
  if (base === null) return null;
  return base + COMMUNITY_JOIN_REAPPLY_COOLDOWN_MS;
}

export function pickMostRelevantCommunityJoinRequest(
  rows: CommunityJoinRequestLike[] | null | undefined,
): CommunityJoinRequestLike | null {
  const list = Array.isArray(rows) ? rows.slice() : [];
  if (list.length === 0) return null;
  list.sort((a, b) => {
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return b.createdAt - a.createdAt;
  });
  return list[0] ?? null;
}

export function communityJoinRequestCanReapply(
  request: CommunityJoinRequestLike | null | undefined,
  nowMs: number,
): boolean {
  const reapplyAt = resolveCommunityJoinRequestReapplyAtMs(request);
  return reapplyAt !== null && reapplyAt <= nowMs;
}

export function communitySubscriptionStatusGrantsAccess(
  status: CommunitySubscriptionLike["status"] | null,
): boolean {
  return status === "active" || status === "past_due" || status === "cancel_at_period_end";
}

function communityAccessSourceIsDurable(
  source: ReturnType<typeof normalizeMembershipAccessSource>,
): boolean {
  return (
    source === "" ||
    source === "free_grant" ||
    source === "manual_grant"
  );
}

export function isActiveEntitlementWindow(nowMs: number, startsAt: unknown, endsAt: unknown): boolean {
  const starts = Number(startsAt);
  if (!Number.isFinite(starts) || starts > nowMs) return false;
  const ends = Number(endsAt);
  if (Number.isFinite(ends) && ends > 0 && nowMs > ends) return false;
  return true;
}

export function tierHasBuilderAccess(rawTier: unknown): boolean {
  const tier = String(rawTier ?? "")
    .trim()
    .toLowerCase();
  return tier === "builder" || tier === "architect" || tier === "pro";
}

export function tierHasArchitectAccess(rawTier: unknown): boolean {
  const tier = String(rawTier ?? "")
    .trim()
    .toLowerCase();
  return tier === "architect" || tier === "pro";
}

export async function resolvePublicUserId(
  ctx: any,
  rawUserId: unknown,
  cache?: Map<string, string | null>,
): Promise<string | null> {
  const normalizedUserId = normalizeIdValue(rawUserId);
  if (!normalizedUserId) return null;
  const cached = cache?.get(normalizedUserId);
  if (cached !== undefined) return cached;
  const user = (await ctx.db.get(rawUserId as any)) as UserLike | null;
  const publicUserId = String(user?.authSubject ?? "").trim() || normalizedUserId;
  cache?.set(normalizedUserId, publicUserId);
  return publicUserId;
}

export async function listCommunityMembershipRowsForManager(args: {
  ctx: any;
  communityId: any;
  userId?: any;
  authSubject?: string | null;
}): Promise<{ community: CommunityLike; rows: CommunityMembershipLike[] }> {
  const userId = await resolveUserIdForAuthenticatedRequest({
    ctx: args.ctx,
    userId: args.userId,
    authSubject: args.authSubject ?? null,
  });
  const { community } = await requireCommunityManager({
    ctx: args.ctx,
    communityId: args.communityId,
    userId,
  });
  const rows = (await args.ctx.db
    .query("communityMemberships")
    .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
    .collect()) as CommunityMembershipLike[];
  const activeRows = rows.filter(
    (row) => communityMembershipRowIsActive(row) && String(row.userId) !== String(community.ownerId),
  );
  activeRows.sort((a, b) => a.createdAt - b.createdAt);
  return { community, rows: activeRows };
}

export function mapCommunityPricingRow(row: CommunityPricePointLike) {
  const billingPeriodRaw = String(row.billingPeriod ?? "").trim().toLowerCase();
  return {
    price_point_id: String(row._id),
    community_id: String(row.communityId),
    billing_period: billingPeriodRaw === "annual" ? "annual" : "monthly",
    name: row.name,
    description: row.description ?? null,
    amount_base_units: Math.max(0, Math.floor(row.amountBaseUnits)),
    currency: row.currency,
    currency_decimals: Math.max(0, Math.floor(row.currencyDecimals)),
    active: Boolean(row.isCurrent) && !row.archivedAt,
    updated_at: toIsoString(row.updatedAt),
  };
}

export async function mapCommunityMemberSettingsRow(
  ctx: any,
  row: CommunityMemberSettingsLike,
  userIdCache?: Map<string, string | null>,
) {
  return {
    id: String(row._id),
    community_id: String(row.communityId),
    user_id: (await resolvePublicUserId(ctx, row.userId, userIdCache)) ?? String(row.userId),
    muted: Boolean(row.muted),
    muted_until: typeof row.mutedUntil === "number" ? toIsoString(row.mutedUntil) : null,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

export async function mapCommunityResourceRow(
  ctx: any,
  row: CommunityResourceLike,
  userIdCache?: Map<string, string | null>,
) {
  return {
    id: String(row._id),
    community_id: String(row.communityId),
    type: String(row.type ?? "").trim().toLowerCase() || "post",
    title: row.title,
    body_md: row.bodyMd ?? null,
    url: row.url ?? null,
    file_key: row.fileKey ?? null,
    pinned: Boolean(row.pinned),
    created_by: (await resolvePublicUserId(ctx, row.createdByUserId, userIdCache)) ?? String(row.createdByUserId),
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

export async function getCommunityAndMembership(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<{
  community: CommunityLike;
  membership: CommunityMembershipLike | null;
}> {
  const community = (await args.ctx.db.get(args.communityId)) as CommunityLike | null;
  if (!community) throw new Error("community_not_found");
  const membershipRows = (await args.ctx.db
    .query("communityMemberships")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", args.userId))
    .collect()) as CommunityMembershipLike[];
  const membership = pickMostRelevantCommunityMembership(membershipRows);
  return { community, membership };
}

async function resolveMostRelevantCommunitySubscription(args: {
  ctx: any;
  membershipId: any;
}): Promise<CommunitySubscriptionLike | null> {
  const rows = (await args.ctx.db
    .query("communitySubscriptions" as any)
    .withIndex("by_membership", (q: any) => q.eq("membershipId", args.membershipId))
    .collect()) as CommunitySubscriptionLike[];
  return (
    rows
      .slice()
      .sort((a, b) => {
        const aStatus = normalizeCommunitySubscriptionStatus(a.status);
        const bStatus = normalizeCommunitySubscriptionStatus(b.status);
        if (communitySubscriptionStatusGrantsAccess(aStatus) !== communitySubscriptionStatusGrantsAccess(bStatus)) {
          return communitySubscriptionStatusGrantsAccess(aStatus) ? -1 : 1;
        }
        return b.updatedAt - a.updatedAt;
      })[0] ?? null
  );
}

export async function resolveCommunityMembershipEntitlementState(args: {
  ctx: any;
  community: CommunityLike;
  membership: CommunityMembershipLike | null;
  userId: any;
}): Promise<CommunityMembershipEntitlementState> {
  if (args.community.ownerId === args.userId) {
    return {
      isEntitled: true,
      accessSource: "manual_grant",
      subscriptionStatus: null,
      subscriptionCurrentPeriodEndAt: null,
    };
  }
  if (!communityMembershipRowIsActive(args.membership)) {
    return {
      isEntitled: false,
      accessSource: normalizeMembershipAccessSource(args.membership?.accessSource) || null,
      subscriptionStatus: null,
      subscriptionCurrentPeriodEndAt: null,
    };
  }
  const entryPolicy = resolveCommunityEntryPolicy(args.community);
  const accessSource = normalizeMembershipAccessSource(args.membership?.accessSource);
  if (entryPolicy !== "paid_subscription" || communityAccessSourceIsDurable(accessSource)) {
    return {
      isEntitled: true,
      accessSource: accessSource || null,
      subscriptionStatus: null,
      subscriptionCurrentPeriodEndAt: null,
    };
  }
  const subscription = await resolveMostRelevantCommunitySubscription({
    ctx: args.ctx,
    membershipId: args.membership!._id,
  });
  const subscriptionStatus = normalizeCommunitySubscriptionStatus(subscription?.status);
  return {
    isEntitled: communitySubscriptionStatusGrantsAccess(subscriptionStatus),
    accessSource: accessSource || null,
    subscriptionStatus,
    subscriptionCurrentPeriodEndAt:
      typeof subscription?.currentPeriodEndAt === "number" ? subscription.currentPeriodEndAt : null,
  };
}

export function mapJoinRequestRow(args: {
  communityId: string;
  row: CommunityJoinRequestLike;
}) {
  const deniedAt = typeof args.row.deniedAt === "number" ? args.row.deniedAt : null;
  const reapplyAt = resolveCommunityJoinRequestReapplyAtMs(args.row);
  return {
    community_id: args.communityId,
    status: String(args.row.status ?? "").trim().toLowerCase() || "pending",
    message: args.row.message ?? null,
    created_at: toIsoString(args.row.createdAt),
    updated_at: toIsoString(args.row.updatedAt),
    denied_at: deniedAt !== null ? toIsoString(deniedAt) : null,
    reapply_at: reapplyAt !== null ? toIsoString(reapplyAt) : null,
    denied_until: reapplyAt !== null ? toIsoString(reapplyAt) : null,
  };
}

export async function requireCommunityChatAccess(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<{ community: CommunityLike }> {
  const { community, membership } = await getCommunityAndMembership(args);
  const entitlement = await resolveCommunityMembershipEntitlementState({
    ctx: args.ctx,
    community,
    membership,
    userId: args.userId,
  });
  if (!entitlement.isEntitled) {
    throw new Error("community_entitlement_required");
  }
  return { community };
}

export async function resolveCommunityAccessBundle(args: {
  ctx: any;
  community: CommunityLike;
  membership: CommunityMembershipLike | null;
  userId: any;
}) {
  const role = normalizeCommunityRoleForOutput(args.membership?.role);
  const isOwner = args.community.ownerId === args.userId;
  const entryPolicy = resolveCommunityEntryPolicy(args.community);
  const entitlement = await resolveCommunityMembershipEntitlementState({
    ctx: args.ctx,
    community: args.community,
    membership: args.membership,
    userId: args.userId,
  });
  const isEntitled = entitlement.isEntitled;
  const isAdmin = !isOwner && isEntitled && role === "admin";
  const isModerator = !isOwner && isEntitled && role === "moderator";
  let joinRequestStatus: string | null = null;
  let joinRequestReapplyAt: number | null = null;
  if (!isEntitled) {
    const joinRequestRows = (await args.ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_user", (q: any) =>
        q.eq("communityId", args.community._id).eq("userId", args.userId),
      )
      .collect()) as CommunityJoinRequestLike[];
    const joinRequest = pickMostRelevantCommunityJoinRequest(joinRequestRows);
    joinRequestStatus = joinRequest ? String(joinRequest.status ?? "").trim().toLowerCase() || "pending" : null;
    joinRequestReapplyAt = resolveCommunityJoinRequestReapplyAtMs(joinRequest);
  }
  const relation: CommunityAccessRelation = isOwner
    ? "owner"
    : isAdmin
      ? "admin"
      : isModerator
        ? "moderator"
      : isEntitled
        ? "member"
        : joinRequestStatus === "pending"
          ? "pending"
          : "visitor";
  const canViewLanding = true;
  const canEnterCommunity = isEntitled;
  const canReadChat = isEntitled;
  const canPostChat = isEntitled;
  const canView = isEntitled || args.community.visibility === "published";
  const canManageMembers = isOwner || isAdmin;
  const canManageResources = isOwner || isAdmin || isModerator;
  const canReviewJoinRequests = isOwner || isAdmin || isModerator;
  const canPostMessage = isEntitled;
  const primaryCta: CommunityPrimaryCta = isEntitled
    ? "open_community"
    : entryPolicy === "paid_subscription"
      ? "checkout"
      : "join";

  return {
    community_id: String(args.community._id),
    user_id: (await resolvePublicUserId(args.ctx, args.userId)) ?? String(args.userId),
    relation,
    entry_policy: entryPolicy,
    visibility: args.community.visibility,
    join_request_status: joinRequestStatus,
    join_request_reapply_at: joinRequestReapplyAt !== null ? toIsoString(joinRequestReapplyAt) : null,
    primary_cta: primaryCta,
    is_owner: isOwner,
    is_entitled: isEntitled,
    access_source: entitlement.accessSource,
    subscription_status: entitlement.subscriptionStatus,
    entitlement_role: isOwner ? "owner" : role || null,
    entitlement_ends_at:
      typeof entitlement.subscriptionCurrentPeriodEndAt === "number"
        ? toIsoString(entitlement.subscriptionCurrentPeriodEndAt)
        : null,
    effective_role: isOwner ? "owner" : role || null,
    can_view_landing: canViewLanding,
    can_enter_community: canEnterCommunity,
    can_read_chat: canReadChat,
    can_post_chat: canPostChat,
    can_view: canView,
    can_post_message: canPostMessage,
    can_manage_resources: canManageResources,
    can_manage_members: canManageMembers,
    can_review_join_requests: canReviewJoinRequests,
  };
}

export async function mapCommunityAccessRow(args: {
  ctx: any;
  community: CommunityLike;
  membership: CommunityMembershipLike | null;
  userId: any;
}) {
  return await resolveCommunityAccessBundle(args);
}

export async function requireCommunityManager(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<{ community: CommunityLike }> {
  const { community, membership } = await getCommunityAndMembership(args);
  const entitlement = await resolveCommunityMembershipEntitlementState({
    ctx: args.ctx,
    community,
    membership,
    userId: args.userId,
  });
  const role = normalizeCommunityRoleForOutput(membership?.role);
  if (!(community.ownerId === args.userId || (entitlement.isEntitled && role === "admin"))) {
    throw new Error("community_forbidden");
  }
  return { community };
}

export async function requireCommunityOwner(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<{ community: CommunityLike }> {
  const { community } = await getCommunityAndMembership(args);
  if (String(community.ownerId) !== String(args.userId)) {
    throw new Error("community_owner_required");
  }
  return { community };
}

export async function requireCommunityModerator(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<{ community: CommunityLike }> {
  const { community, membership } = await getCommunityAndMembership(args);
  const entitlement = await resolveCommunityMembershipEntitlementState({
    ctx: args.ctx,
    community,
    membership,
    userId: args.userId,
  });
  const role = normalizeCommunityRoleForOutput(membership?.role);
  if (
    !(
      community.ownerId === args.userId ||
      (entitlement.isEntitled && (role === "admin" || role === "moderator"))
    )
  ) {
    throw new Error("community_forbidden");
  }
  return { community };
}

export function mapActivePlanSummaries<
  TPlan extends {
    name: string;
    description?: string;
    amountBaseUnits: number;
    currency: string;
    currencyDecimals: number;
    billingPeriod: string;
    updatedAt: number;
  },
>(plans: TPlan[]): PublicPlanSummaryLike[] {
  return plans
    .slice()
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .map((plan) => {
      const billingPeriodRaw = String(plan.billingPeriod ?? "").trim().toLowerCase();
      return {
        name: plan.name,
        description: plan.description ?? null,
        amount_base_units: String(Math.max(0, Math.floor(plan.amountBaseUnits))),
        currency: plan.currency,
        currency_decimals: Math.max(0, Math.floor(plan.currencyDecimals)),
        billing_period: billingPeriodRaw === "annual" ? "annual" : "monthly",
      };
    });
}

export function pickPreferredActivePlan(plans: PublicPlanSummaryLike[]): PublicPlanSummaryLike | null {
  return (
    plans.find((plan) => plan.billing_period === "monthly") ??
    plans.find((plan) => plan.billing_period === "annual") ??
    plans[0] ??
    null
  );
}
