import { resolveAuthenticatedSubject } from "./authIdentity";

export type CommunityLike = {
  _id: any;
  ownerId: any;
  slug: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  avatarStorageId?: any;
  bannerUrl?: string;
  bannerStorageId?: any;
  bannerFocusX?: number;
  bannerFocusY?: number;
  bannerZoom?: number;
  visibility: "published" | "unlisted";
  freeJoinRequiresApproval: boolean;
  joinMode: "join_free" | "request_access" | "checkout";
  createdAt: number;
  updatedAt: number;
};

export type CommunityMembershipLike = {
  _id: any;
  communityId: any;
  userId: any;
  role: string;
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
  role: "user" | "assistant" | "system";
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

export type CommunityAgentDraftLike = {
  _id: any;
  communityId: any;
  slot: number;
  name?: string;
  landingJson?: unknown;
  systemPrompt: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};

export type CommunityJoinRequestLike = {
  _id: any;
  communityId: any;
  userId: any;
  status: string;
  message?: string;
  createdAt: number;
  updatedAt: number;
};

export type CommunityPlanLike = {
  _id: any;
  communityId: any;
  billingPeriod: string;
  name: string;
  description?: string;
  amountBaseUnits: number;
  currency: string;
  currencyDecimals: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
};

export type CommunityInviteLike = {
  _id: any;
  communityId: any;
  code: string;
  maxUses?: number;
  usesCount: number;
  expiresAt?: number;
  revokedAt?: number;
  createdByUserId: any;
  createdAt: number;
  updatedAt: number;
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

export type CommunityMemoryCandidateLike = {
  _id: any;
  communityId: any;
  proposerUserId: any;
  title?: string;
  memoryText: string;
  evidenceJson: unknown;
  routerState: string;
  signalScore: number;
  routerReason?: string;
  promotedMemoryId?: string;
  reviewedBy?: any;
  reviewedAt?: number;
  requestKey?: string;
  createdAt: number;
  updatedAt: number;
};

export type PublicPlanSummaryLike = {
  name: string;
  description: string | null;
  amount_base_units: string;
  currency: string;
  currency_decimals: number;
  billing_period: string;
};

export function normalizeIdValue(raw: unknown): string {
  return String(raw ?? "").trim();
}

export async function resolveUserIdForAuthenticatedRequest(args: {
  ctx: any;
  userId?: any;
  authSubject?: string | null;
}): Promise<any> {
  const userIdInput = normalizeIdValue(args.userId);
  const authSubject = await resolveAuthenticatedSubject({
    ctx: args.ctx,
    authSubject: args.authSubject ?? null,
  });
  const user = await args.ctx.db
    .query("users")
    .withIndex("by_authSubject", (q: any) => q.eq("authSubject", authSubject))
    .first();
  if (!user) throw new Error("user_not_found");
  const resolvedUserId = normalizeIdValue(user._id);
  if (userIdInput && userIdInput !== resolvedUserId) {
    throw new Error("user_id_mismatch");
  }
  return user._id;
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

export function normalizeInviteCode(raw: unknown): string {
  const code = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (!code) throw new Error("invite_code_required");
  if (!/^[A-Z0-9-]{4,80}$/.test(code)) throw new Error("invite_code_invalid");
  return code;
}

export function normalizeOptionalPositiveInt(raw: unknown): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    throw new Error("invite_max_uses_invalid");
  }
  return parsed;
}

export function normalizeRole(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
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

export function normalizeJoinMode(
  raw: unknown,
  fallback: "join_free" | "request_access" | "checkout",
): "join_free" | "request_access" | "checkout" {
  const joinMode = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (joinMode === "checkout" || joinMode === "request_access" || joinMode === "join_free") return joinMode;
  return fallback;
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

function canManageCommunityInvites(args: {
  community: CommunityLike;
  membership: CommunityMembershipLike | null;
  userId: any;
}): boolean {
  if (args.community.ownerId === args.userId) return true;
  const role = normalizeRole(args.membership?.role);
  return role === "owner" || role === "admin";
}

export function normalizeRoleAssignment(raw: unknown): "owner" | "admin" | "mod" | "member" {
  const role = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (role === "owner" || role === "admin" || role === "mod" || role === "member") {
    return role;
  }
  throw new Error("member_role_invalid");
}

export function isActiveEntitlementWindow(nowMs: number, startsAt: unknown, endsAt: unknown): boolean {
  const starts = Number(startsAt);
  if (!Number.isFinite(starts) || starts > nowMs) return false;
  const ends = Number(endsAt);
  if (Number.isFinite(ends) && ends > 0 && nowMs > ends) return false;
  return true;
}

export function tierHasProAccess(rawTier: unknown): boolean {
  const tier = String(rawTier ?? "")
    .trim()
    .toLowerCase();
  return tier === "builder" || tier === "architect" || tier === "pro";
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
  if (!rows.some((row) => String(row.userId) === String(community.ownerId))) {
    rows.push({
      _id: (`synthetic-owner:${String(community._id)}` as any),
      communityId: community._id,
      userId: community.ownerId,
      role: "owner",
      createdAt: community.createdAt,
      updatedAt: community.updatedAt,
    } as CommunityMembershipLike);
  }
  rows.sort((a, b) => a.createdAt - b.createdAt);
  return { community, rows };
}

export async function mapCommunityInviteRow(
  ctx: any,
  row: CommunityInviteLike,
  userIdCache?: Map<string, string | null>,
) {
  return {
    id: String(row._id),
    community_id: String(row.communityId),
    code: row.code,
    max_uses: typeof row.maxUses === "number" ? Math.floor(row.maxUses) : null,
    expires_at: typeof row.expiresAt === "number" ? toIsoString(row.expiresAt) : null,
    revoked_at: typeof row.revokedAt === "number" ? toIsoString(row.revokedAt) : null,
    created_by: (await resolvePublicUserId(ctx, row.createdByUserId, userIdCache)) ?? String(row.createdByUserId),
    created_at: toIsoString(row.createdAt),
  };
}

export function mapCommunityPricingRow(row: CommunityPlanLike) {
  return {
    plan_id: String(row._id),
    community_id: String(row.communityId),
    billing_period: String(row.billingPeriod ?? "").trim() || "monthly",
    name: row.name,
    description: row.description ?? null,
    amount_base_units: Math.max(0, Math.floor(row.amountBaseUnits)),
    currency: row.currency,
    currency_decimals: Math.max(0, Math.floor(row.currencyDecimals)),
    active: Boolean(row.active),
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

export async function mapCommunityMemoryCandidateRow(
  ctx: any,
  row: CommunityMemoryCandidateLike,
  userIdCache?: Map<string, string | null>,
) {
  return {
    id: String(row._id),
    community_id: String(row.communityId),
    proposer_user_id:
      (await resolvePublicUserId(ctx, row.proposerUserId, userIdCache)) ?? String(row.proposerUserId),
    title: row.title ?? null,
    memory_text: row.memoryText,
    evidence_json: row.evidenceJson ?? null,
    router_state: String(row.routerState ?? "").trim().toLowerCase() || "proposed",
    signal_score: Number.isFinite(Number(row.signalScore)) ? Number(row.signalScore) : 0,
    router_reason: row.routerReason ?? null,
    promoted_memory_id: row.promotedMemoryId ?? null,
    reviewed_by: row.reviewedBy
      ? (await resolvePublicUserId(ctx, row.reviewedBy, userIdCache)) ?? String(row.reviewedBy)
      : null,
    reviewed_at: typeof row.reviewedAt === "number" ? toIsoString(row.reviewedAt) : null,
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
  const membership = (await args.ctx.db
    .query("communityMemberships")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", args.userId))
    .first()) as CommunityMembershipLike | null;
  return { community, membership };
}

export function mapJoinRequestRow(args: {
  communityId: string;
  row: CommunityJoinRequestLike;
}) {
  return {
    community_id: args.communityId,
    status: String(args.row.status ?? "").trim().toLowerCase() || "pending",
    message: args.row.message ?? null,
    created_at: toIsoString(args.row.createdAt),
    updated_at: toIsoString(args.row.updatedAt),
  };
}

export async function requireCommunityInviteManager(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<{ community: CommunityLike }> {
  const { community, membership } = await getCommunityAndMembership(args);
  if (!canManageCommunityInvites({ community, membership, userId: args.userId })) {
    throw new Error("community_forbidden");
  }
  return { community };
}

export function inviteIsExpired(invite: CommunityInviteLike, nowMs: number): boolean {
  if (typeof invite.revokedAt === "number") return true;
  if (typeof invite.expiresAt === "number" && nowMs > invite.expiresAt) return true;
  if (typeof invite.maxUses === "number" && invite.maxUses > 0 && invite.usesCount >= invite.maxUses) return true;
  return false;
}

function hasCommunityEntitlement(args: {
  community: CommunityLike;
  membership: CommunityMembershipLike | null;
  userId: any;
}): boolean {
  if (args.community.ownerId === args.userId) return true;
  return Boolean(args.membership);
}

export async function requireCommunityChatAccess(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<{ community: CommunityLike }> {
  const { community, membership } = await getCommunityAndMembership(args);
  if (!hasCommunityEntitlement({ community, membership, userId: args.userId })) {
    throw new Error("community_entitlement_required");
  }
  return { community };
}

export async function mapCommunityAccessRow(args: {
  ctx: any;
  community: CommunityLike;
  membership: CommunityMembershipLike | null;
  userId: any;
}) {
  const role = args.membership?.role ? String(args.membership.role).trim().toLowerCase() : "";
  const isOwner = args.community.ownerId === args.userId || role === "owner";
  const isAdmin = role === "admin";
  const isMember = isOwner || Boolean(args.membership);
  const canView = isMember || args.community.visibility === "published";
  const canManageMembers = isOwner || isAdmin;
  const canManageResources = isOwner || isAdmin;
  const canInvite = isOwner || isAdmin;
  const canCreateResource = isMember;
  const canPostMessage = isMember;
  return {
    community_id: String(args.community._id),
    user_id: (await resolvePublicUserId(args.ctx, args.userId)) ?? String(args.userId),
    is_owner: isOwner,
    is_entitled: isMember,
    entitlement_role: isOwner ? "owner" : role || null,
    entitlement_ends_at: null,
    effective_role: isOwner ? "owner" : role || null,
    can_view: canView,
    can_post_message: canPostMessage,
    can_create_resource: canCreateResource,
    can_manage_resources: canManageResources,
    can_invite: canInvite,
    can_manage_members: canManageMembers,
  };
}

function canManageCommunity(args: {
  community: CommunityLike;
  membership: CommunityMembershipLike | null;
  userId: any;
}): boolean {
  if (args.community.ownerId === args.userId) return true;
  const role = normalizeRole(args.membership?.role);
  return role === "owner" || role === "admin";
}

export async function requireCommunityManager(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<{ community: CommunityLike }> {
  const { community, membership } = await getCommunityAndMembership(args);
  if (!canManageCommunity({ community, membership, userId: args.userId })) {
    throw new Error("community_forbidden");
  }
  return { community };
}

export function canCreateCommunityResource(args: {
  community: CommunityLike;
  membership: CommunityMembershipLike | null;
  userId: any;
}): boolean {
  return hasCommunityEntitlement(args);
}

export function mapActivePlanSummaries(plans: CommunityPlanLike[]): PublicPlanSummaryLike[] {
  return plans
    .slice()
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .map((plan) => ({
      name: plan.name,
      description: plan.description ?? null,
      amount_base_units: String(Math.max(0, Math.floor(plan.amountBaseUnits))),
      currency: plan.currency,
      currency_decimals: Math.max(0, Math.floor(plan.currencyDecimals)),
      billing_period: String(plan.billingPeriod ?? "").trim() || "monthly",
    }));
}

export function pickPreferredActivePlan(plans: PublicPlanSummaryLike[]): PublicPlanSummaryLike | null {
  return (
    plans.find((plan) => plan.billing_period === "monthly") ??
    plans.find((plan) => plan.billing_period === "yearly") ??
    plans[0] ??
    null
  );
}
