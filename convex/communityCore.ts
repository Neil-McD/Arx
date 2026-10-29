import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { findTestMemberByUserId } from "./communityTestMemberCore";
import {
  buildCommunityResourceDirectoryFields,
  buildCommunityResourceModuleDirectoryFields,
} from "../shared/communityResourceDirectory";
import {
  communityResourceIsMemberVisiblePage,
  communityResourceModuleIsMemberLive,
} from "../shared/communityResourceVisibility";
import type { CommunityVisualIdentity } from "../shared/communityVisualIdentity";
import type { CommunityLessonFields } from "../shared/communityLessonContract";
import {
  parseCommunityLessonElements,
  publicCommunityLessonElement,
  redactCommunityLessonAnswers,
} from "../shared/communityLessonContract";
import {
  communityIsActive,
  type CommunityLifecycleStatus,
} from "../shared/communityLifecycle";
import type { CommunityBuilderAccessMode } from "../shared/founderPlan";
import {
  requireCommunityBuilderAccess,
  resolveCommunityBuilderAccess,
} from "./communityBuilderAccessCore";
import {
  getCurrentCommunityJoinRequestByPair,
  resolveCommunityJoinRequestReapplyAtMs,
} from "./communityJoinRequestCore";
export { resolveUserIdForAuthenticatedRequest } from "./authActor";

export type CommunityLike = {
  _id: any;
  ownerId: any;
  slug: string;
  name: string;
  lifecycleStatus?: CommunityLifecycleStatus;
  lifecycleGeneration?: number;
  builderAccessMode?: CommunityBuilderAccessMode;
  builderKnowledgeSetupPending?: boolean;
  builderKnowledgeBuildStage?: "architecture" | "content";
  builderKnowledgeBuildLeaseToken?: string;
  builderKnowledgeBuildLeaseExpiresAt?: number;
  oneLiner?: string;
  about?: string;
  externalFunnelUrl?: string;
  externalFunnelActive?: boolean;
  avatarUrl?: string;
  avatarStorageId?: any;
  avatarFocusX?: number;
  avatarFocusY?: number;
  avatarZoom?: number;
  bannerUrl?: string;
  bannerStorageId?: any;
  bannerFocusX?: number;
  bannerFocusY?: number;
  bannerZoom?: number;
  brandingRevision?: number;
  settingsRevision?: number;
  visibility: "published" | "unlisted";
  entryPolicy?: CommunityEntryPolicy;
  activeMemberCount?: number;
  createdAt: number;
  updatedAt: number;
};

export type CommunityEntryPolicy = "open" | "approval" | "paid_subscription";
export type CommunityAccessRelation = "visitor" | "pending" | "member" | "moderator" | "admin" | "owner";
export type CommunityPrimaryCta =
  | "open_community"
  | "join"
  | "checkout"
  | "manage_billing"
  | "unavailable";

export type CommunityMembershipLike = {
  _id: any;
  communityId: any;
  userId: any;
  role: string;
  coCreator?: boolean;
  accessSource?: string;
  pricePointId?: any;
  active?: boolean;
  activationSequence?: number;
  activatedAt?: number;
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

export type CommunityTypingPresenceLike = {
  _id: any;
  communityId: any;
  channelId?: any;
  userId: any;
  rootId?: any;
  displayUntil: number;
  createdAt: number;
  updatedAt: number;
};

export type CommunityAgentConfigLike = {
  _id: any;
  communityId: any;
  landingJson?: unknown;
  systemPrompt: string;
  createdAt: number;
  updatedAt: number;
};

export type CommunityBlockLike = {
  _id: any;
  communityId: any;
  userId: any;
  createdByUserId: any;
  reason?: string;
  liftedAt?: number;
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
  providerAccountId?: string;
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
  source?: "stripe" | "external_sync";
  status: "active" | "past_due" | "cancel_at_period_end" | "canceled" | "ended";
  providerSubscriptionId?: string;
  providerAccountId?: string;
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
  chatLastSeenSeq?: number;
  chatLastSeenAt?: number;
  aiFeedLastSeenAt?: number;
  resourcesLastSeenAt?: number;
  eventsLastSeenAt?: number;
  mentionsLastSeenAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type CommunityResourceLike = {
  _id: any;
  communityId: any;
  moduleId?: any;
  createdByUserId: any;
  type: string;
  role?: string;
  status?: string;
  sourceResourceId?: any;
  title: string;
  bodyMd?: string;
  bodyChars?: number;
  bodyHash?: string;
  bodyMigratedAt?: number;
  url?: string;
  fileKey?: string;
  sourceIngestionStatus?: string;
  sourceIngestionKind?: string;
  sourceIngestionError?: string;
  sourceIngestionAttemptedAt?: number;
  sourceIngestedAt?: number;
  sourceIngestionLeaseId?: string;
  sourceIngestionLeaseExpiresAt?: number;
  sourceIngestionAttempt?: number;
  sourceOriginalFilename?: string;
  sourceOriginalMimeType?: string;
  sourceOriginalBytes?: number;
  sourceExternalProvider?: string;
  sourceExternalConnectionUserId?: any;
  sourceExternalId?: string;
  sourceExternalName?: string;
  sourceExternalUrl?: string;
  sourceExternalMimeType?: string;
  sourceExternalModifiedAt?: number;
  pinned: boolean;
  sortOrder?: number;
  lesson?: CommunityLessonFields;
  createdAt: number;
  updatedAt: number;
};

export type CommunityResourceSourceIngestionStatus =
  | "not_required"
  | "queued"
  | "processing"
  | "ready"
  | "failed";

export type CommunityResourceSourceIngestionKind =
  | "manual"
  | "url"
  | "file"
  | "google_drive"
  | "github";

export type CommunityResourceModuleLike = {
  _id: any;
  communityId: any;
  createdByUserId: any;
  status?: CommunityResourceModuleStatus;
  name: string;
  descriptionMd?: string;
  bannerUrl?: string;
  bannerStorageId?: any;
  bannerFocusX?: number;
  bannerFocusY?: number;
  bannerZoom?: number;
  lessonStyle?: CommunityResourceModuleLessonStyle;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

export type CommunityResourceModuleLessonStyle = "article" | "video";

export function normalizeResourceModuleLessonStyle(value: unknown): CommunityResourceModuleLessonStyle {
  return value === "video" ? "video" : "article";
}

async function resolveCommunityResourceModuleName(
  ctx: any,
  row: CommunityResourceLike,
  moduleNameCache?: Map<string, string | null>,
): Promise<string | null> {
  if (!row.moduleId) return null;
  const moduleId = String(row.moduleId);
  if (moduleNameCache?.has(moduleId)) return moduleNameCache.get(moduleId) ?? null;
  const module = (await ctx.db.get(row.moduleId as any)) as CommunityResourceModuleLike | null;
  const name = module && String(module.communityId) === String(row.communityId)
    ? module.name
    : null;
  moduleNameCache?.set(moduleId, name);
  return name;
}

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

export function normalizeAvatarFocus(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0.5;
  return Math.max(0, Math.min(1, parsed));
}

export function normalizeBannerZoom(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(2.5, parsed));
}

export function normalizeAvatarZoom(raw: unknown): number {
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
  avatar_focus_x: number;
  avatar_focus_y: number;
  avatar_zoom: number;
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
    avatar_focus_x: normalizeAvatarFocus(row.avatarFocusX),
    avatar_focus_y: normalizeAvatarFocus(row.avatarFocusY),
    avatar_zoom: normalizeAvatarZoom(row.avatarZoom),
    banner_url: bannerUrl ?? row.bannerUrl ?? null,
    banner_storage_id: row.bannerStorageId ? String(row.bannerStorageId) : null,
    banner_focus_x: normalizeBannerFocus(row.bannerFocusX),
    banner_focus_y: normalizeBannerFocus(row.bannerFocusY),
    banner_zoom: normalizeBannerZoom(row.bannerZoom),
  };
}

export type ResolvedCommunityBrandingFields = Awaited<
  ReturnType<typeof resolveCommunityBrandingFields>
>;

export function resolveCommunityBrandingRevision(row: CommunityLike): number {
  const stored = Math.floor(Number(row.brandingRevision));
  if (Number.isFinite(stored) && stored >= 0) return stored;
  const legacyUpdatedAt = Math.floor(Number(row.updatedAt));
  return Number.isFinite(legacyUpdatedAt) && legacyUpdatedAt >= 0
    ? legacyUpdatedAt
    : 0;
}

export function nextCommunityBrandingRevision(row: CommunityLike): number {
  return resolveCommunityBrandingRevision(row) + 1;
}

export function buildCommunityVisualIdentity(
  row: CommunityLike,
  branding: ResolvedCommunityBrandingFields,
): CommunityVisualIdentity {
  return {
    community_id: String(row._id),
    revision: resolveCommunityBrandingRevision(row),
    name: row.name,
    avatar: {
      resource_key: branding.avatar_storage_id
        ? `storage:${branding.avatar_storage_id}`
        : branding.avatar_url
          ? `url:${branding.avatar_url}`
          : null,
      url: branding.avatar_url,
      focus_x: branding.avatar_focus_x,
      focus_y: branding.avatar_focus_y,
      zoom: branding.avatar_zoom,
    },
    banner: {
      resource_key: branding.banner_storage_id
        ? `storage:${branding.banner_storage_id}`
        : branding.banner_url
          ? `url:${branding.banner_url}`
          : null,
      url: branding.banner_url,
      focus_x: branding.banner_focus_x,
      focus_y: branding.banner_focus_y,
      zoom: branding.banner_zoom,
    },
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

// A requested visibility: exactly one of the two states. Anything else is
// refused, never read as "published" (publishing must be asked for).
export function normalizeVisibility(raw: unknown): "published" | "unlisted" {
  const visibility = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (visibility === "published" || visibility === "unlisted") return visibility;
  throw new Error("community_visibility_invalid");
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

export function normalizeResourceRole(raw: unknown): "page" | "source" {
  const role = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (role === "source") return "source";
  return "page";
}

export type CommunityResourceStatus = "draft" | "review" | "published" | "processing" | "failed";
export type CommunityResourceModuleStatus = "draft" | "live";

export function parseResourceStatusForWrite(raw: unknown): CommunityResourceStatus | null {
  const status = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (status === "draft") return "draft";
  if (status === "review" || status === "in_review" || status === "needs_review") return "review";
  if (status === "processing") return "processing";
  if (status === "failed") return "failed";
  if (status === "published") return "published";
  return null;
}

export function requireResourceStatusForWrite(raw: unknown): CommunityResourceStatus {
  const status = parseResourceStatusForWrite(raw);
  if (!status) throw new Error("community_resource_status_invalid");
  if (status === "published") throw new Error("community_resource_page_status_deprecated");
  return status;
}

export function normalizeResourceStatus(raw: unknown): CommunityResourceStatus {
  const status = String(raw ?? "").trim();
  if (!status) return "published";
  return parseResourceStatusForWrite(status) ?? "draft";
}

export function parseResourceModuleStatusForWrite(raw: unknown): CommunityResourceModuleStatus | null {
  const status = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (status === "draft") return "draft";
  if (status === "live" || status === "published") return "live";
  return null;
}

export function requireResourceModuleStatusForWrite(raw: unknown): CommunityResourceModuleStatus {
  const rawStatus = String(raw ?? "").trim().toLowerCase();
  if (rawStatus === "published") throw new Error("community_resource_module_status_invalid");
  const status = parseResourceModuleStatusForWrite(raw);
  if (!status) throw new Error("community_resource_module_status_invalid");
  return status;
}

export function normalizeResourceModuleStatus(raw: unknown): CommunityResourceModuleStatus {
  const rawStatus = String(raw ?? "").trim();
  if (!rawStatus) return "live";
  return parseResourceModuleStatusForWrite(rawStatus) ?? "draft";
}

export function parseResourceSourceIngestionStatusForWrite(
  raw: unknown,
): CommunityResourceSourceIngestionStatus | null {
  const status = String(raw ?? "").trim().toLowerCase();
  if (status === "not_required" || status === "not-required" || status === "none") return "not_required";
  if (status === "queued" || status === "pending") return "queued";
  if (status === "processing" || status === "running") return "processing";
  if (status === "ready" || status === "complete" || status === "completed") return "ready";
  if (status === "failed" || status === "error") return "failed";
  return null;
}

export function requireResourceSourceIngestionStatusForWrite(
  raw: unknown,
): CommunityResourceSourceIngestionStatus {
  const status = parseResourceSourceIngestionStatusForWrite(raw);
  if (!status) throw new Error("community_resource_source_ingestion_status_invalid");
  return status;
}

export function parseResourceSourceIngestionKindForWrite(
  raw: unknown,
): CommunityResourceSourceIngestionKind | null {
  const kind = String(raw ?? "").trim().toLowerCase();
  if (kind === "manual") return "manual";
  if (kind === "url" || kind === "link" || kind === "web") return "url";
  if (kind === "file" || kind === "upload") return "file";
  if (kind === "google_drive" || kind === "google-drive" || kind === "drive") return "google_drive";
  if (kind === "github" || kind === "git_hub") return "github";
  return null;
}

export function requireResourceSourceIngestionKindForWrite(
  raw: unknown,
): CommunityResourceSourceIngestionKind {
  const kind = parseResourceSourceIngestionKindForWrite(raw);
  if (!kind) throw new Error("community_resource_source_ingestion_kind_invalid");
  return kind;
}

export function normalizeResourceSourceIngestionStatus(
  row: CommunityResourceLike,
): CommunityResourceSourceIngestionStatus {
  const explicit = parseResourceSourceIngestionStatusForWrite(row.sourceIngestionStatus);
  if (explicit) return explicit;
  if (normalizeResourceRole(row.role) !== "source") return "not_required";
  if (communityResourceBodyChars(row) > 0) return "ready";
  if (
    String(row.url ?? "").trim() ||
    String(row.fileKey ?? "").trim() ||
    String(row.sourceExternalId ?? "").trim()
  ) return "queued";
  return "not_required";
}

export function normalizeResourceSourceIngestionKind(
  row: CommunityResourceLike,
): CommunityResourceSourceIngestionKind {
  const explicit = parseResourceSourceIngestionKindForWrite(row.sourceIngestionKind);
  if (explicit) return explicit;
  if (String(row.sourceExternalProvider ?? "").trim() === "google_drive") return "google_drive";
  if (String(row.sourceExternalProvider ?? "").trim() === "github") return "github";
  if (String(row.fileKey ?? "").trim()) return "file";
  if (String(row.url ?? "").trim()) return "url";
  return "manual";
}

export function communityResourceBodyChars(row: CommunityResourceLike): number {
  const legacyBody = String(row.bodyMd ?? "").trim();
  if (legacyBody) return legacyBody.length;
  const chars = Number(row.bodyChars ?? 0);
  return Number.isFinite(chars) && chars > 0 ? Math.floor(chars) : 0;
}

export function communityResourceSourceHasReadyText(row: CommunityResourceLike): boolean {
  return normalizeResourceRole(row.role) === "source" &&
    normalizeResourceSourceIngestionStatus(row) === "ready" &&
    communityResourceBodyChars(row) > 0;
}

export function communityResourceHasUsableKnowledgeContent(row: CommunityResourceLike): boolean {
  return Boolean(
    String(row.title ?? "").trim() &&
      (
        communityResourceBodyChars(row) > 0 ||
        String(row.url ?? "").trim() ||
        String(row.fileKey ?? "").trim()
      ),
  );
}

export function communityResourceModuleIsLive(row: CommunityResourceModuleLike): boolean {
  return communityResourceModuleIsMemberLive(row);
}

export function communityResourceIsLiveModulePage(
  row: CommunityResourceLike,
  liveModuleIds: Set<string>,
): boolean {
  return communityResourceIsMemberVisiblePage(row, liveModuleIds);
}

export function normalizeOptionalUrl(raw: unknown): string | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    try {
      url = new URL(`https://${value}`);
    } catch {
      throw new Error("community_url_invalid");
    }
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("community_url_invalid");
  }
  return url.toString().slice(0, 4096);
}

export function normalizeOptionalFileKey(raw: unknown): string | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return undefined;
  return value.slice(0, 4096);
}

export function communityMembershipIsCoCreator(membership: CommunityMembershipLike | null | undefined): boolean {
  return Boolean(membership) && normalizeCommunityRoleForOutput(membership!.role) === "admin" && membership!.coCreator === true;
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

export function normalizeCommunityActiveMemberCount(rawCount: unknown): number | null {
  const count = Number(rawCount);
  if (!Number.isFinite(count) || count < 0) return null;
  return Math.floor(count);
}

export function readCommunityActiveMemberCount(
  community: CommunityLike | null | undefined,
): number | null {
  return normalizeCommunityActiveMemberCount(community?.activeMemberCount);
}

export function communityMembershipCountsTowardActiveMemberCount(args: {
  community: CommunityLike;
  membership: CommunityMembershipLike | null | undefined;
}): boolean {
  if (!communityMembershipRowIsActive(args.membership)) return false;
  return String(args.membership?.userId ?? "") !== String(args.community.ownerId);
}

export async function listCanonicalCommunityMemberMembershipRows(args: {
  ctx: any;
  communityId: any;
  community?: CommunityLike | null;
}): Promise<{ community: CommunityLike; rows: CommunityMembershipLike[] }> {
  const community =
    args.community ??
    ((await args.ctx.db.get(args.communityId as any)) as CommunityLike | null);
  if (!community) throw new Error("community_not_found");
  const rows = (await args.ctx.db
    .query("communityMemberships")
    .withIndex("by_community_createdAt", (q: any) =>
      q.eq("communityId", args.communityId),
    )
    .order("asc")
    .collect()) as CommunityMembershipLike[];
  return {
    community,
    rows: rows.filter((row) =>
      communityMembershipCountsTowardActiveMemberCount({ community, membership: row })
    ),
  };
}

/** Users standing in as an owner's test members here. They are left out of
 * every member count a person reads (sales page, Offers, Workflows, Members),
 * so a test run never makes a community look bigger. */
export async function listActiveTestMemberUserIds(ctx: any, communityId: any, options?: { includeEnded?: boolean }): Promise<Set<string>> {
  const rows = await ctx.db.query("communityTestMembers")
    .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId))
    .take(500);
  return new Set(rows.filter((row: any) => options?.includeEnded || !row.endedAt).map((row: any) => String(row.userId)));
}

/** The number people see: active members, without the owner and without test members. */
export function countPeopleFacingMembers(rows: CommunityMembershipLike[] | null | undefined, testUserIds: Set<string>): number {
  return (rows ?? []).filter((row) => !testUserIds.has(String(row.userId))).length;
}

export function countCanonicalCommunityMembersFromRows(
  rows: CommunityMembershipLike[] | null | undefined,
): number {
  return 1 + (rows?.length ?? 0);
}

export async function countCanonicalCommunityMembers(args: {
  ctx: any;
  communityId: any;
  community?: CommunityLike | null;
}): Promise<number> {
  const { rows } = await listCanonicalCommunityMemberMembershipRows(args);
  return countCanonicalCommunityMembersFromRows(rows);
}

export async function computeCommunityActiveMemberCount(args: {
  ctx: any;
  communityId: any;
  community?: CommunityLike | null;
}): Promise<number> {
  return await countCanonicalCommunityMembers(args);
}

export async function syncCommunityActiveMemberCount(args: {
  ctx: any;
  communityId: any;
  community?: CommunityLike | null;
}): Promise<number> {
  const community =
    args.community ??
    ((await args.ctx.db.get(args.communityId as any)) as CommunityLike | null);
  if (!community) throw new Error("community_not_found");
  const nextCount = await computeCommunityActiveMemberCount({
    ctx: args.ctx,
    communityId: args.communityId,
    community,
  });
  if (readCommunityActiveMemberCount(community) !== nextCount) {
    await args.ctx.db.patch(community._id as any, {
      activeMemberCount: nextCount,
    });
  }
  return nextCount;
}

export async function adjustCommunityActiveMemberCountForMembershipTransition(args: {
  ctx: any;
  communityId: any;
  before: CommunityMembershipLike | null | undefined;
  after: CommunityMembershipLike | null | undefined;
}): Promise<void> {
  void args.before;
  void args.after;
  await syncCommunityActiveMemberCount({
    ctx: args.ctx,
    communityId: args.communityId,
  });
}

export async function getUniqueCommunityMembershipByPair(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<CommunityMembershipLike | null> {
  try {
    return (await args.ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q: any) =>
        q.eq("communityId", args.communityId).eq("userId", args.userId),
      )
      .unique()) as CommunityMembershipLike | null;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith(
        "unique() query returned more than one result from table communityMemberships",
      )
    ) {
      throw new Error("community_membership_pair_not_unique");
    }
    throw error;
  }
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

export async function getActiveCommunityBlock(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<CommunityBlockLike | null> {
  const rows = (await args.ctx.db
    .query("communityBlocks" as any)
    .withIndex("by_community_user", (q: any) =>
      q.eq("communityId", args.communityId).eq("userId", args.userId),
    )
    .collect()) as CommunityBlockLike[];
  return (
    rows
      .filter((row) => !(typeof row.liftedAt === "number" && row.liftedAt > 0))
      .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
  );
}

export async function communityUserIsBlocked(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<boolean> {
  return (await getActiveCommunityBlock(args)) !== null;
}

export async function requireCommunityUserNotBlocked(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<void> {
  if (await communityUserIsBlocked(args)) {
    throw new Error("community_user_blocked");
  }
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
  const canonicalRows = await listCanonicalCommunityMemberMembershipRows({
    ctx: args.ctx,
    communityId: args.communityId,
    community,
  });
  return { community, rows: canonicalRows.rows };
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
  moduleNameCache?: Map<string, string | null>,
  // Members get lesson bodies without quiz answers; only people who can edit
  // the resource see (and save back) the original.
  viewer: { canManage: boolean } = { canManage: false },
) {
  const lessonElements = row.lesson
    ? parseCommunityLessonElements(row.bodyMd).map(publicCommunityLessonElement)
    : null;
  const bodyMd = row.lesson && !viewer.canManage && row.bodyMd
    ? redactCommunityLessonAnswers(row.bodyMd)
    : row.bodyMd;
  const resourceDirectory = buildCommunityResourceDirectoryFields({
    communityId: String(row.communityId),
    moduleId: row.moduleId ? String(row.moduleId) : null,
    moduleName: await resolveCommunityResourceModuleName(ctx, row, moduleNameCache),
    resourceId: String(row._id),
    resourceTitle: row.title,
    resourceRole: normalizeResourceRole(row.role),
  });
  return {
    id: String(row._id),
    community_id: String(row.communityId),
    module_id: row.moduleId ? String(row.moduleId) : null,
    directory_uri: resourceDirectory.directory_uri,
    directory_path: resourceDirectory.directory_path,
    type: String(row.type ?? "").trim().toLowerCase() || "post",
    resource_role: normalizeResourceRole(row.role),
    resource_status: normalizeResourceStatus(row.status),
    source_resource_id: row.sourceResourceId ? String(row.sourceResourceId) : null,
    title: row.title,
    body_md: bodyMd ?? null,
    body_chars: communityResourceBodyChars(row),
    url: row.url ?? null,
    file_key: row.fileKey ?? null,
    source_ingestion_status: normalizeResourceSourceIngestionStatus(row),
    source_ingestion_kind: normalizeResourceSourceIngestionKind(row),
    source_ingestion_error: row.sourceIngestionError ?? null,
    source_ingestion_attempted_at:
      typeof row.sourceIngestionAttemptedAt === "number" ? toIsoString(row.sourceIngestionAttemptedAt) : null,
    source_ingested_at:
      typeof row.sourceIngestedAt === "number" ? toIsoString(row.sourceIngestedAt) : null,
    source_original_filename: row.sourceOriginalFilename ?? null,
    source_original_mime_type: row.sourceOriginalMimeType ?? null,
    source_original_bytes:
      typeof row.sourceOriginalBytes === "number" && Number.isFinite(row.sourceOriginalBytes)
        ? row.sourceOriginalBytes
        : null,
    source_external_provider: row.sourceExternalProvider ?? null,
    source_external_id: row.sourceExternalId ?? null,
    source_external_name: row.sourceExternalName ?? null,
    source_external_url: row.sourceExternalUrl ?? null,
    source_external_mime_type: row.sourceExternalMimeType ?? null,
    source_external_modified_at:
      typeof row.sourceExternalModifiedAt === "number" ? toIsoString(row.sourceExternalModifiedAt) : null,
    pinned: Boolean(row.pinned),
    sort_order: Number.isFinite(row.sortOrder) ? row.sortOrder : null,
    lesson: row.lesson ?? null,
    lesson_elements: lessonElements,
    created_by: (await resolvePublicUserId(ctx, row.createdByUserId, userIdCache)) ?? String(row.createdByUserId),
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

export async function mapCommunityResourceModuleRow(
  ctx: any,
  row: CommunityResourceModuleLike,
  userIdCache?: Map<string, string | null>,
) {
  void userIdCache;
  const resolvedBannerUrl = row.bannerStorageId
    ? await maybeResolveStorageUrl(ctx, row.bannerStorageId)
    : null;
  const moduleDirectory = buildCommunityResourceModuleDirectoryFields({
    communityId: String(row.communityId),
    moduleId: String(row._id),
    moduleName: row.name,
  });
  return {
    id: String(row._id),
    community_id: String(row.communityId),
    directory_uri: moduleDirectory.directory_uri,
    directory_path: moduleDirectory.directory_path,
    module_status: normalizeResourceModuleStatus(row.status),
    name: row.name,
    description_md: row.descriptionMd ?? null,
    banner_url: resolvedBannerUrl ?? row.bannerUrl ?? null,
    banner_storage_id: row.bannerStorageId ? String(row.bannerStorageId) : null,
    banner_focus_x: typeof row.bannerFocusX === "number" ? row.bannerFocusX : null,
    banner_focus_y: typeof row.bannerFocusY === "number" ? row.bannerFocusY : null,
    banner_zoom: typeof row.bannerZoom === "number" ? row.bannerZoom : null,
    lesson_style: normalizeResourceModuleLessonStyle(row.lessonStyle),
    sort_order: Number.isFinite(row.sortOrder) ? row.sortOrder : 0,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

export function requireActiveCommunity(
  community: CommunityLike,
): CommunityLike {
  if (!communityIsActive(community)) {
    throw new Error("community_archived");
  }
  return community;
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
  requireActiveCommunity(community);
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

/**
 * The welcome flow: when the builder turns it on, a member whose first-stage
 * "member joins" rule requested a form, and who has not submitted it yet,
 * can open only that form. Owners and admins are never held. The gate is read
 * from the pending requests themselves, so cancelling or submitting a request
 * (or turning the setting off) opens the community at once.
 */
export async function readCommunityWelcomeGate(args: {
  ctx: any;
  community: CommunityLike;
  membership: CommunityMembershipLike | null;
  userId: any;
}): Promise<{ required: boolean; requestIds: string[]; lessonIds: string[]; display: WelcomeDisplay }> {
  const open = { required: false, requestIds: [] as string[], lessonIds: [] as string[], display: "page" as WelcomeDisplay };
  if (String(args.community.ownerId) === String(args.userId) || !args.membership) return open;
  if (normalizeCommunityRoleForOutput(args.membership.role) === "admin") return open;
  const workflow = await args.ctx.db.query("communityMemberWorkflows")
    .withIndex("by_community", (q: any) => q.eq("communityId", args.community._id)).first();
  if (!workflow?.welcomeGate) return open;
  const display: WelcomeDisplay = workflow.welcomeDisplay === "popup" ? "popup" : "page";
  // A test run started at a later stage tests that stage, not the welcome flow.
  const testMember = await findTestMemberByUserId(args.ctx, args.userId);
  if (testMember?.startMilestoneKey && testMember.startMilestoneKey !== workflow.milestones?.[0]?.key) return open;
  const byStatus = (status: "pending" | "submitted") => args.ctx.db.query("communityFormRequests")
    .withIndex("by_member_status", (q: any) => q.eq("membershipId", args.membership!._id).eq("status", status))
    .take(20);
  const [pending, submitted] = await Promise.all([byStatus("pending"), byStatus("submitted")]);
  // Only a request whose first-stage "member joins" rule still exists holds the
  // member; a rule the builder removed never leaves anyone locked out.
  const first = workflow.milestones?.[0];
  const joinRules = new Set((first?.automations ?? [])
    .filter((rule: any) => rule.trigger?.type === "member_joined" && rule.action?.type === "request_form")
    .map((rule: any) => rule.key));
  const isWelcomeRequest = async (request: any) => {
    if (String(request.workflowId) !== String(workflow._id) || request.milestoneKey !== first?.key) return false;
    if ((request.activationSequence ?? 0) !== (args.membership!.activationSequence ?? 0)) return false;
    if (!joinRules.has(request.automationKey)) return false;
    const run = await args.ctx.db.get(request.workflowRunId);
    return run?.triggerType === "member_joined";
  };
  const requestIds: string[] = [];
  for (const request of pending) if (await isWelcomeRequest(request)) requestIds.push(String(request._id));
  // A member who has already sent a welcome form is in the flow, so its lessons apply to them too.
  let sentWelcomeForm = false;
  for (const request of submitted) if (!sentWelcomeForm && await isWelcomeRequest(request)) sentWelcomeForm = true;
  const membership = args.membership;
  const joinedAfterGate = membership.activationSequence === 1
    && typeof workflow.welcomeGateEnabledAt === "number" && typeof membership.activatedAt === "number"
    && membership.activatedAt >= workflow.welcomeGateEnabledAt;
  // Welcome lessons come after the forms and hold anyone the flow applies to
  // until each is marked done. A lesson since removed or unpublished drops out.
  const lessonIds: string[] = [];
  if ((requestIds.length || sentWelcomeForm || joinedAfterGate) && workflow.welcomeLessonIds?.length) {
    for (const resourceId of workflow.welcomeLessonIds) {
      if (!(await welcomeLessonIsLive(args.ctx, args.community._id, resourceId))) continue;
      const progress = await args.ctx.db.query("communityResourceProgress")
        .withIndex("by_community_user_resource", (q: any) =>
          q.eq("communityId", args.community._id).eq("userId", args.userId).eq("resourceId", resourceId))
        .unique();
      if (progress?.status !== "done") lessonIds.push(String(resourceId));
    }
  }
  if (requestIds.length || lessonIds.length) return { required: true, requestIds, lessonIds, display };
  // The join rule runs just after the join commits, so a member who joined
  // after the flow was turned on is held from the first moment, before their
  // forms exist. The hold lapses if the rule never runs, so nobody is locked out.
  if (!joinedAfterGate || joinRules.size === 0 || Date.now() - membership.activatedAt! >= WELCOME_PREPARING_MS) return open;
  const runs = await args.ctx.db.query("communityMemberWorkflowRuns")
    .withIndex("by_workflow_membership_createdAt", (q: any) => q.eq("workflowId", workflow._id).eq("membershipId", membership._id))
    .take(20);
  const joinRan = runs.some((run: any) => run.triggerType === "member_joined");
  return joinRan ? open : { required: true, requestIds: [], lessonIds: [], display };
}

export type WelcomeDisplay = "page" | "popup";

/** Whether the welcome flow keeps the member out of the rest of the community.
 * A pop-up opens the community behind it, so it asks without holding. */
export function welcomeHolds(gate: { required: boolean; display: WelcomeDisplay }): boolean {
  return gate.required && gate.display !== "popup";
}

/** A welcome lesson counts only while members can see it: a page in a live course. */
export async function welcomeLessonIsLive(ctx: any, communityId: any, resourceId: any): Promise<boolean> {
  const row = (await ctx.db.get(resourceId)) as CommunityResourceLike | null;
  if (!row || String((row as any).communityId) !== String(communityId)) return false;
  const module = row.moduleId ? ((await ctx.db.get(row.moduleId)) as CommunityResourceModuleLike | null) : null;
  const liveModuleIds = new Set(module && communityResourceModuleIsLive(module) ? [normalizeIdValue(module._id)] : []);
  return communityResourceIsLiveModulePage(row, liveModuleIds);
}

/** The community's welcome lesson ids while the welcome flow is on, else none. A held member may work on these. */
export async function communityWelcomeLessonIds(ctx: any, communityId: any): Promise<Set<string>> {
  const workflow = await ctx.db.query("communityMemberWorkflows")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId)).first();
  return new Set(workflow?.welcomeGate ? (workflow.welcomeLessonIds ?? []).map((id: any) => String(id)) : []);
}

/** How long a new member waits on the join rule before the welcome hold lapses. */
const WELCOME_PREPARING_MS = 2 * 60_000;

// Live communities an owner may have before the next one needs its own Agent
// plan. Callers exempt the platform owner and a community with its own plan.
export const FREE_COMMUNITIES_PER_OWNER = 10;

// Counts every live community the owner has (archived ones don't count), never
// a truncated page of their history; stops at the limit.
export async function requireOwnerBelowFreeCommunityLimit(ctx: any, ownerId: any): Promise<void> {
  let live = 0;
  for await (const row of ctx.db.query("communities").withIndex("by_owner", (q: any) => q.eq("ownerId", ownerId))) {
    if (!communityIsActive(row as any)) continue;
    live += 1;
    if (live >= FREE_COMMUNITIES_PER_OWNER) throw new Error("community_owner_limit_reached");
  }
}

// The one answer to "who is this person in this community, and what may they
// do": every access check, Studio's access bundle, the twin, the site API and
// the MCP read it. Relations and powers are granted only while the community
// can run and the person is entitled and not blocked; the stored role alone
// grants nothing.
export type CommunityLens = {
  community: CommunityLike;
  membership: CommunityMembershipLike | null;
  operational: boolean;
  /** Why the community can't run, when it can't (as requireCommunityBuilderAccess throws it). */
  unavailableCode: "community_archived" | "community_temporarily_unavailable" | null;
  isOwner: boolean;
  isBlocked: boolean;
  /** The membership row's role, whether or not it grants anything now. */
  storedRole: string;
  entitlement: CommunityMembershipEntitlementState;
  /** Entitled and not blocked, whether or not the community can run. */
  membershipEntitled: boolean;
  /** In the community right now: membershipEntitled and the community can run. */
  entitled: boolean;
  /** What they are here now; null when they aren't in. */
  relation: "owner" | "admin" | "moderator" | "member" | null;
  can: {
    enter: boolean;
    readChat: boolean;
    postChat: boolean;
    postMessage: boolean;
    view: boolean;
    moderateContent: boolean;
    reviewJoinRequests: boolean;
    manageMembers: boolean;
    manageResources: boolean;
    managePricing: boolean;
    manageBranding: boolean;
    managePublishing: boolean;
    managePayouts: boolean;
  };
};

export async function resolveCommunityLens(args: {
  ctx: any;
  community: CommunityLike;
  membership: CommunityMembershipLike | null;
  userId: any;
}): Promise<CommunityLens> {
  const { community, membership } = args;
  const builderAccess = await resolveCommunityBuilderAccess({ ctx: args.ctx, community });
  const operational = builderAccess.operational;
  const isOwner = String(community.ownerId) === String(args.userId);
  const isBlocked = isOwner
    ? false
    : await communityUserIsBlocked({ ctx: args.ctx, communityId: community._id, userId: args.userId });
  const storedRole = normalizeCommunityRoleForOutput(membership?.role);
  const entitlement = await resolveCommunityMembershipEntitlementState({
    ctx: args.ctx,
    community,
    membership,
    userId: args.userId,
  });
  const membershipEntitled = !isBlocked && entitlement.isEntitled;
  const entitled = membershipEntitled && operational;
  const isAdmin = !isOwner && membershipEntitled && storedRole === "admin";
  const isModerator = !isOwner && membershipEntitled && storedRole === "moderator";
  const isCoCreator = isAdmin && communityMembershipIsCoCreator(membership);
  const relation = !entitled
    ? null
    : isOwner
      ? "owner"
      : isAdmin
        ? "admin"
        : isModerator
          ? "moderator"
          : "member";
  const manager = operational && (isOwner || isAdmin);
  const moderator = operational && (isOwner || isAdmin || isModerator);
  return {
    community,
    membership,
    operational,
    unavailableCode: operational
      ? null
      : builderAccess.reason === "community_archived"
        ? "community_archived"
        : "community_temporarily_unavailable",
    isOwner,
    isBlocked,
    storedRole,
    entitlement,
    membershipEntitled,
    entitled,
    relation,
    can: {
      enter: entitled,
      readChat: entitled,
      postChat: entitled,
      postMessage: entitled,
      view: !isBlocked && operational,
      moderateContent: moderator,
      reviewJoinRequests: moderator,
      manageMembers: manager,
      manageResources: manager,
      managePricing: manager,
      manageBranding: operational && (isOwner || isCoCreator),
      managePublishing: operational && (isOwner || isCoCreator),
      managePayouts: operational && isOwner,
    },
  };
}

// The lens for a community by id, refusing what any access check refuses
// first: a community that can't run, then a blocked member (never the owner).
async function requireCommunityLens(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<CommunityLens> {
  const { community, membership } = await getCommunityAndMembership(args);
  const lens = await resolveCommunityLens({ ctx: args.ctx, community, membership, userId: args.userId });
  if (lens.unavailableCode) throw new Error(lens.unavailableCode);
  if (lens.isBlocked) throw new Error("community_user_blocked");
  return lens;
}

export async function requireCommunityChatAccess(args: {
  ctx: any;
  communityId: any;
  userId: any;
  /** Form paths pass this so a member held by the welcome flow can finish it. */
  allowWelcome?: boolean;
}): Promise<{ community: CommunityLike }> {
  const lens = await requireCommunityLens(args);
  if (!lens.can.readChat) throw new Error("community_entitlement_required");
  if (!args.allowWelcome && welcomeHolds(await readCommunityWelcomeGate({
    ctx: args.ctx, community: lens.community, membership: lens.membership, userId: args.userId,
  }))) {
    throw new Error("community_welcome_required");
  }
  return { community: lens.community };
}

export async function resolveCommunityAccessBundle(args: {
  ctx: any;
  community: CommunityLike;
  membership: CommunityMembershipLike | null;
  userId: any;
}) {
  requireActiveCommunity(args.community);
  const lens = await resolveCommunityLens(args);
  const builderAccess = { operational: lens.operational };
  const role = lens.storedRole;
  const isOwner = lens.isOwner;
  const isBlocked = lens.isBlocked;
  const entryPolicy = resolveCommunityEntryPolicy(args.community);
  const entitlement = lens.entitlement;
  const isMembershipEntitled = lens.membershipEntitled;
  const isEntitled = lens.entitled;
  const isAdmin = !isOwner && isMembershipEntitled && role === "admin";
  const isModerator = !isOwner && isMembershipEntitled && role === "moderator";
  let joinRequestStatus: string | null = null;
  let joinRequestReapplyAt: number | null = null;
  if (!isEntitled && !isOwner && !isBlocked) {
    const joinRequest = await getCurrentCommunityJoinRequestByPair({
      ctx: args.ctx,
      communityId: args.community._id,
      userId: args.userId,
    });
    joinRequestStatus = joinRequest ? String(joinRequest.status).trim().toLowerCase() : null;
    joinRequestReapplyAt = resolveCommunityJoinRequestReapplyAtMs(joinRequest);
  }
  const relation: CommunityAccessRelation | null = isOwner
    ? "owner"
    : isAdmin
      ? "admin"
      : isModerator
        ? "moderator"
        : isEntitled
          ? "member"
          : joinRequestStatus === "pending" && !isBlocked
            ? "pending"
            : !isBlocked
              ? "visitor"
              : null;
  const welcome = isEntitled
    ? await readCommunityWelcomeGate({ ctx: args.ctx, community: args.community, membership: args.membership, userId: args.userId })
    : { required: false, requestIds: [] as string[], lessonIds: [] as string[], display: "page" as WelcomeDisplay };
  const held = welcomeHolds(welcome);
  const canViewLanding = true;
  // A member held by the welcome flow enters the community but sees only the form.
  const canEnterCommunity = lens.can.enter;
  const canReadChat = lens.can.readChat && !held;
  const canPostChat = lens.can.postChat && !held;
  const canView = lens.can.view;
  const canManageMembers = lens.can.manageMembers;
  const canManageResources = lens.can.manageResources;
  const canModerateContent = lens.can.moderateContent;
  const canReviewJoinRequests = lens.can.reviewJoinRequests;
  const canManagePricing = lens.can.managePricing;
  const canManageBranding = lens.can.manageBranding;
  const canManagePublishing = lens.can.managePublishing;
  const canManagePayouts = lens.can.managePayouts;
  const canPostMessage = lens.can.postMessage && !welcome.required;
  const primaryCta: CommunityPrimaryCta = !builderAccess.operational
    ? isOwner
      ? "manage_billing"
      : "unavailable"
    : isEntitled
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
    membership_entitled: isMembershipEntitled,
    is_blocked: isBlocked,
    access_source: entitlement.accessSource,
    subscription_status: entitlement.subscriptionStatus,
    community_availability: builderAccess.operational
      ? "available"
      : "temporarily_unavailable",
    billing_recovery_action:
      isOwner && !builderAccess.operational ? "manage_billing" : null,
    entitlement_role: isOwner ? "owner" : role || null,
    entitlement_ends_at:
      typeof entitlement.subscriptionCurrentPeriodEndAt === "number"
        ? toIsoString(entitlement.subscriptionCurrentPeriodEndAt)
        : null,
    // What they are here now (null when they aren't in), not the stored role.
    effective_role: lens.relation,
    can_view_landing: canViewLanding,
    can_enter_community: canEnterCommunity,
    can_read_chat: canReadChat,
    can_post_chat: canPostChat,
    can_view: canView,
    can_post_message: canPostMessage,
    can_manage_resources: canManageResources,
    can_moderate_content: canModerateContent,
    can_manage_members: canManageMembers,
    can_review_join_requests: canReviewJoinRequests,
    can_manage_pricing: canManagePricing,
    can_manage_branding: canManageBranding,
    can_manage_publishing: canManagePublishing,
    can_manage_payouts: canManagePayouts,
    welcome_required: welcome.required,
    welcome_form_request_ids: welcome.requestIds,
    welcome_lesson_ids: welcome.lessonIds,
    welcome_display: welcome.display,
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
  const lens = await requireCommunityLens(args);
  if (!lens.can.manageMembers) throw new Error("community_forbidden");
  return { community: lens.community };
}

export async function requireCommunityOwner(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<{ community: CommunityLike }> {
  const { community } = await getCommunityAndMembership(args);
  await requireCommunityBuilderAccess({ ctx: args.ctx, community });
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
  const lens = await requireCommunityLens(args);
  if (!lens.can.moderateContent) throw new Error("community_forbidden");
  return { community: lens.community };
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
