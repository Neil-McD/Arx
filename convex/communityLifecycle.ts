import { internal } from "./_generated/api";
import { requireNotTestMemberOutsideCommunity } from "./communityTestMemberCore";
import { internalMutation, mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { communityIsActive } from "../shared/communityLifecycle";
import { recordCriticalAuditEvent } from "./criticalAudit";
import { requireOwnerBelowFreeCommunityLimit } from "./communityCore";
import {
  type CommunityLike,
  type CommunityPricePointLike,
  maybeDeleteStorageAsset,
  normalizeAvatarFocus,
  normalizeAvatarZoom,
  normalizeBannerFocus,
  normalizeEntryPolicy,
  normalizeBannerZoom,
  normalizeName,
  normalizeOptionalCommunityImageUrl,
  normalizeOptionalText,
  normalizeSlug,
  normalizeVisibility,
  requireCommunityManager,
  requireCommunityOwner,
  resolveCommunityEntryPolicy,
  resolveCommunityBrandingFields,
  buildCommunityVisualIdentity,
  nextCommunityBrandingRevision,
  resolvePublicUserId,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import {
  requireAccountSetupCompleteForUser,
  requireProfileSetupCompleteForUser,
} from "./accountSetupCore";
import {
  getCommunityPublishReadinessBlockingFields,
  type CommunityPublishReadinessInput,
} from "../shared/communityPublishReadiness";
import {
  canReceiveCommunityRevenue,
  type StripeConnectRevenueDestinationLike,
} from "./stripeConnectAccountCore";
import { COMMUNITY_FUNDING_POLICY_MANAGED } from "../shared/founderInference";
import { ensureGeneralChannel } from "./communityChannelCore";
import { syncCommunityWeeklyDigestScheduleForCommunity } from "./communityWeeklyDigestSchedule";
import { ensureCommunityPresenceBaseline } from "./communityPresenceCore";
import {
  COMMUNITY_BUILDER_ACCESS_FREE,
  COMMUNITY_BUILDER_ACCESS_SUBSCRIPTION_REQUIRED,
  founderSubscriptionStatusGrantsAccess,
} from "../shared/founderPlan";
import {
  syncFounderUsageCycle,
  type FounderSubscriptionRow,
} from "./founderPlanCore";
import {
  requireFounderInferencePricingFromEnv,
  requireFounderStripePriceIdFromEnv,
} from "./founderPlanPricing";
import { hasPlatformOwnerComplimentaryAccess } from "./operatorEntitlementsCore";
import {
  communityFounderWelcomeIdempotencyKey,
} from "../shared/communityFounderWelcome";

const COMMUNITY_DELETION_QUARANTINE_CODE =
  "community_delete_lifecycle_migration_blocked" as const;

async function mapCommunityRecord(ctx: any, row: CommunityLike): Promise<{
  id: string;
  slug: string;
  name: string;
  owner_id: string;
  one_liner: string | null;
  about: string | null;
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
  visibility: string;
  entry_policy: string;
  builder_knowledge_setup_pending: boolean;
  created_at: string;
  updated_at: string;
  branding_revision: number;
  settings_revision: number;
  visual_identity: ReturnType<typeof buildCommunityVisualIdentity>;
}> {
  const branding = await resolveCommunityBrandingFields(ctx, row);
  const entryPolicy = resolveCommunityEntryPolicy(row);
  const userIdCache = new Map<string, string | null>();
  return {
    id: String(row._id),
    slug: row.slug,
    name: row.name,
    owner_id: (await resolvePublicUserId(ctx, row.ownerId, userIdCache)) ?? String(row.ownerId),
    one_liner: row.oneLiner ?? null,
    about: row.about ?? null,
    avatar_url: branding.avatar_url,
    avatar_storage_id: branding.avatar_storage_id,
    avatar_focus_x: branding.avatar_focus_x,
    avatar_focus_y: branding.avatar_focus_y,
    avatar_zoom: branding.avatar_zoom,
    banner_url: branding.banner_url,
    banner_storage_id: branding.banner_storage_id,
    banner_focus_x: branding.banner_focus_x,
    banner_focus_y: branding.banner_focus_y,
    banner_zoom: branding.banner_zoom,
    visibility: row.visibility,
    entry_policy: entryPolicy,
    builder_knowledge_setup_pending: row.builderKnowledgeSetupPending === true,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
    branding_revision: row.brandingRevision ?? row.updatedAt,
    settings_revision: resolveCommunitySettingsRevision(row),
    visual_identity: buildCommunityVisualIdentity(row, branding),
  };
}

function resolveCommunitySettingsRevision(community: CommunityLike): number {
  const revision = Number(community.settingsRevision ?? 0);
  return Number.isFinite(revision) && revision >= 0
    ? Math.floor(revision)
    : 0;
}

function requireExpectedCommunitySettingsRevision(
  expectedRevision: number | undefined,
  community: CommunityLike,
): void {
  if (expectedRevision === undefined) return;
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0
  ) {
    throw new Error("community_settings_revision_invalid");
  }
  if (expectedRevision !== resolveCommunitySettingsRevision(community)) {
    throw new Error("community_settings_conflict");
  }
}

function requireCommunityPublishReadinessTransition(input: {
  currentVisibility?: string | null;
  nextVisibility?: string | null;
  current: CommunityPublishReadinessInput;
  next: CommunityPublishReadinessInput;
}): void {
  const blocking = getCommunityPublishReadinessBlockingFields(input);
  if (blocking.length > 0) {
    throw new Error(`community_publish_ready_required:${blocking.join(",")}`);
  }
}

function normalizePlanAmount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.max(1, Math.floor(parsed));
}

function sameOptionalId(left: unknown, right: unknown): boolean {
  return String(left ?? "") === String(right ?? "");
}

function sameOptionalText(left: unknown, right: unknown): boolean {
  return String(left ?? "") === String(right ?? "");
}

function sameNumber(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.0001;
}

async function getCurrentCommunityPriceAmounts(ctx: any, communityId: any): Promise<{
  monthlyAmount: number | null;
  annualAmount: number | null;
}> {
  const currentPricePointRows = (await ctx.db
    .query("communityPricePoints" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .collect()) as CommunityPricePointLike[];
  const pickCurrentAmount = (billingPeriod: "monthly" | "annual"): number | null => {
    const current =
      currentPricePointRows
        .filter((row) => row.billingPeriod === billingPeriod && row.isCurrent)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
    return current ? Math.max(1, Math.floor(Number(current.amountBaseUnits ?? 0))) : null;
  };
  return {
    monthlyAmount: pickCurrentAmount("monthly"),
    annualAmount: pickCurrentAmount("annual"),
  };
}

async function mapCommunitySettingsSnapshot(
  ctx: any,
  community: CommunityLike,
): Promise<{
  community_id: string;
  name: string;
  slug: string;
  one_liner: string | null;
  about: string | null;
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
  visibility: string;
  updated_at: string;
  branding_revision: number;
  settings_revision: number;
  visual_identity: ReturnType<typeof buildCommunityVisualIdentity>;
  pricing: {
    mode: "free" | "monthly" | "annual";
    monthly_amount_base_units: number | null;
    annual_amount_base_units: number | null;
    currency: "usd";
    currency_decimals: 2;
  };
}> {
  const record = await mapCommunityRecord(ctx, community);
  const pricing = await getCurrentCommunityPriceAmounts(ctx, community._id);
  const mode = pricing.monthlyAmount !== null
    ? "monthly"
    : pricing.annualAmount !== null
      ? "annual"
      : "free";
  return {
    community_id: record.id,
    name: record.name,
    slug: record.slug,
    one_liner: record.one_liner,
    about: record.about,
    avatar_url: record.avatar_url,
    avatar_storage_id: record.avatar_storage_id,
    avatar_focus_x: record.avatar_focus_x,
    avatar_focus_y: record.avatar_focus_y,
    avatar_zoom: record.avatar_zoom,
    banner_url: record.banner_url,
    banner_storage_id: record.banner_storage_id,
    banner_focus_x: record.banner_focus_x,
    banner_focus_y: record.banner_focus_y,
    banner_zoom: record.banner_zoom,
    visibility: record.visibility,
    updated_at: record.updated_at,
    branding_revision: record.branding_revision,
    settings_revision: record.settings_revision,
    visual_identity: record.visual_identity,
    pricing: {
      mode,
      monthly_amount_base_units: pricing.monthlyAmount,
      annual_amount_base_units: pricing.annualAmount,
      currency: "usd",
      currency_decimals: 2,
    },
  };
}

function resolveCommunitySettingsState(args: any, community: CommunityLike, currentPricing: {
  monthlyAmount: number | null;
  annualAmount: number | null;
}) {
  const normalizedSlug = normalizeSlug(args.slug);
  const monthlyAmount = normalizePlanAmount(args.monthlyAmountBaseUnits);
  const annualAmount = normalizePlanAmount(args.annualAmountBaseUnits);
  if (monthlyAmount !== null && annualAmount !== null) {
    throw new Error("community_pricing_mode_invalid");
  }

  const monetizationChanged =
    monthlyAmount !== currentPricing.monthlyAmount || annualAmount !== currentPricing.annualAmount;
  const hasPaidPlan = monthlyAmount !== null || annualAmount !== null;
  const currentEntryPolicy = resolveCommunityEntryPolicy(community);
  const nextEntryPolicy: "open" | "approval" | "paid_subscription" = hasPaidPlan
    ? "paid_subscription"
    : currentEntryPolicy === "approval"
      ? "approval"
      : "open";
  const currency = String(args.currency ?? "usd")
    .trim()
    .toLowerCase() || "usd";
  const currencyDecimals = Math.max(0, Math.floor(args.currencyDecimals ?? 2));
  const nextName = normalizeName(args.name);
  const nextOneLiner = normalizeOptionalText(args.oneLiner);
  const nextAbout = normalizeOptionalText(args.about, 8_000);
  const nextAvatarStorageId =
    args.avatarStorageId !== undefined
      ? (args.avatarStorageId ?? undefined)
      : args.avatarUrl !== undefined
        ? undefined
        : community.avatarStorageId;
  const nextBannerStorageId =
    args.bannerStorageId !== undefined
      ? (args.bannerStorageId ?? undefined)
      : args.bannerUrl !== undefined
        ? undefined
        : community.bannerStorageId;
  const nextAvatarUrl =
    nextAvatarStorageId
      ? undefined
      : args.avatarUrl !== undefined
        ? normalizeOptionalCommunityImageUrl(args.avatarUrl)
        : community.avatarUrl;
  const nextAvatarFocusX =
    args.avatarFocusX !== undefined ? normalizeAvatarFocus(args.avatarFocusX) : normalizeAvatarFocus(community.avatarFocusX);
  const nextAvatarFocusY =
    args.avatarFocusY !== undefined ? normalizeAvatarFocus(args.avatarFocusY) : normalizeAvatarFocus(community.avatarFocusY);
  const nextAvatarZoom =
    args.avatarZoom !== undefined ? normalizeAvatarZoom(args.avatarZoom) : normalizeAvatarZoom(community.avatarZoom);
  const nextBannerUrl =
    nextBannerStorageId
      ? undefined
      : args.bannerUrl !== undefined
        ? normalizeOptionalCommunityImageUrl(args.bannerUrl)
        : community.bannerUrl;
  const nextBannerFocusX =
    args.bannerFocusX !== undefined ? normalizeBannerFocus(args.bannerFocusX) : normalizeBannerFocus(community.bannerFocusX);
  const nextBannerFocusY =
    args.bannerFocusY !== undefined ? normalizeBannerFocus(args.bannerFocusY) : normalizeBannerFocus(community.bannerFocusY);
  const nextBannerZoom =
    args.bannerZoom !== undefined ? normalizeBannerZoom(args.bannerZoom) : normalizeBannerZoom(community.bannerZoom);
  const nextVisibility = args.visibility !== undefined
    ? normalizeVisibility(args.visibility)
    : community.visibility;

  return {
    normalizedSlug,
    monthlyAmount,
    annualAmount,
    monetizationChanged,
    nextEntryPolicy,
    currency,
    currencyDecimals,
    nextName,
    nextOneLiner,
    nextAbout,
    nextAvatarStorageId,
    nextBannerStorageId,
    nextAvatarUrl,
    nextAvatarFocusX,
    nextAvatarFocusY,
    nextAvatarZoom,
    nextBannerUrl,
    nextBannerFocusX,
    nextBannerFocusY,
    nextBannerZoom,
    nextVisibility,
    identityChanged: nextName !== community.name || normalizedSlug !== community.slug,
    brandingChanged:
      !sameOptionalText(nextAvatarUrl, community.avatarUrl) ||
      !sameOptionalId(nextAvatarStorageId, community.avatarStorageId) ||
      !sameNumber(nextAvatarFocusX, normalizeAvatarFocus(community.avatarFocusX)) ||
      !sameNumber(nextAvatarFocusY, normalizeAvatarFocus(community.avatarFocusY)) ||
      !sameNumber(nextAvatarZoom, normalizeAvatarZoom(community.avatarZoom)) ||
      !sameOptionalText(nextBannerUrl, community.bannerUrl) ||
      !sameOptionalId(nextBannerStorageId, community.bannerStorageId) ||
      !sameNumber(nextBannerFocusX, normalizeBannerFocus(community.bannerFocusX)) ||
      !sameNumber(nextBannerFocusY, normalizeBannerFocus(community.bannerFocusY)) ||
      !sameNumber(nextBannerZoom, normalizeBannerZoom(community.bannerZoom)),
    visibilityChanged: nextVisibility !== community.visibility,
  };
}

async function requirePaidCommunityPricingReady(args: {
  ctx: any;
  community: CommunityLike;
  nowMs: number;
}) {
  const ownerBilling = (await args.ctx.runQuery(
    internal.auth.getAccountCommerceAccessForUserInternal as any,
    {
      userId: args.community.ownerId,
      nowMs: args.nowMs,
    },
  )) as { has_payouts?: unknown } | null;
  if (ownerBilling?.has_payouts !== true) {
    throw new Error("community_payout_access_required");
  }
  const connectAccount = (await args.ctx.runQuery(
    internal.creatorCommerce.getUserStripeConnectAccountInternal as any,
    {
      userId: args.community.ownerId,
    },
  )) as StripeConnectRevenueDestinationLike | null;
  if (!connectAccount) {
    throw new Error("community_stripe_connect_required");
  }
  if (!canReceiveCommunityRevenue(connectAccount)) {
    throw new Error("community_stripe_connect_not_ready");
  }
}

async function requireCommunitySettingsPermissions(args: {
  ctx: any;
  communityId: any;
  community: CommunityLike;
  userId: any;
  state: ReturnType<typeof resolveCommunitySettingsState>;
  nowMs: number;
}) {
  if (args.state.identityChanged) {
    await requireCommunityOwner({
      ctx: args.ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
  }
  if (args.state.brandingChanged) {
    await requireCommunityOwner({
      ctx: args.ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
  }
  if (args.state.visibilityChanged) {
    await requireCommunityOwner({
      ctx: args.ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
  }
  requireCommunityPublishReadinessTransition({
    currentVisibility: args.community.visibility,
    nextVisibility: args.state.nextVisibility,
    current: {
      name: args.community.name,
      oneLiner: args.community.oneLiner,
      avatarUrl: args.community.avatarUrl,
      avatarStorageId: args.community.avatarStorageId,
      bannerUrl: args.community.bannerUrl,
      bannerStorageId: args.community.bannerStorageId,
    },
    next: {
      name: args.state.nextName,
      oneLiner: args.state.nextOneLiner,
      avatarUrl: args.state.nextAvatarUrl,
      avatarStorageId: args.state.nextAvatarStorageId,
      bannerUrl: args.state.nextBannerUrl,
      bannerStorageId: args.state.nextBannerStorageId,
    },
  });
  if (args.state.monetizationChanged && (args.state.monthlyAmount !== null || args.state.annualAmount !== null)) {
    await requirePaidCommunityPricingReady({
      ctx: args.ctx,
      community: args.community,
      nowMs: args.nowMs,
    });
  }
}

async function upsertCommunityPricePoint(args: {
  ctx: any;
  communityId: any;
  billingPeriod: "monthly" | "annual";
  amountBaseUnits: number | null;
  name: string;
  description: string | null | undefined;
  currency: string;
  currencyDecimals: number;
  nowMs: number;
}): Promise<string | null> {
  const rows = (await args.ctx.db
    .query("communityPricePoints" as any)
    .withIndex("by_community_billingPeriod", (q: any) =>
      q.eq("communityId", args.communityId).eq("billingPeriod", args.billingPeriod),
    )
    .collect()) as CommunityPricePointLike[];
  rows.sort((a, b) => b.updatedAt - a.updatedAt);
  const currentRows = rows.filter((row) => Boolean(row.isCurrent)).sort((a, b) => b.updatedAt - a.updatedAt);
  const current = currentRows[0] ?? null;

  if (args.amountBaseUnits === null) {
    for (const row of currentRows) {
      await args.ctx.db.patch(row._id as any, {
        isCurrent: false,
        archivedAt: row.archivedAt ?? args.nowMs,
        updatedAt: args.nowMs,
      });
    }
    return null;
  }

  const hasMatchingCurrent = Boolean(
    current &&
      current.amountBaseUnits === args.amountBaseUnits &&
      current.currency === args.currency &&
      current.currencyDecimals === args.currencyDecimals,
  );

  if (hasMatchingCurrent && current) {
    await args.ctx.db.patch(current._id as any, {
      name: args.name,
      description: args.description,
      isCurrent: true,
      archivedAt: undefined,
      updatedAt: args.nowMs,
    });
    for (const extra of currentRows.slice(1)) {
      await args.ctx.db.patch(extra._id as any, {
        isCurrent: false,
        archivedAt: extra.archivedAt ?? args.nowMs,
        updatedAt: args.nowMs,
      });
    }
    return String(current._id);
  }

  for (const row of currentRows) {
    await args.ctx.db.patch(row._id as any, {
      isCurrent: false,
      archivedAt: row.archivedAt ?? args.nowMs,
      updatedAt: args.nowMs,
    });
  }

  const pricePointId = await args.ctx.db.insert("communityPricePoints" as any, {
    communityId: args.communityId,
    billingPeriod: args.billingPeriod,
    name: args.name,
    description: args.description,
    amountBaseUnits: args.amountBaseUnits,
    currency: args.currency,
    currencyDecimals: args.currencyDecimals,
    isCurrent: true,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  return String(pricePointId);
}

async function upsertCommunitySettingsPricePoints(args: {
  ctx: any;
  communityId: any;
  state: ReturnType<typeof resolveCommunitySettingsState>;
  nowMs: number;
}) {
  await upsertCommunityPricePoint({
    ctx: args.ctx,
    communityId: args.communityId,
    billingPeriod: "monthly",
    amountBaseUnits: args.state.monthlyAmount,
    name: args.state.nextName,
    description: args.state.nextOneLiner,
    currency: args.state.currency,
    currencyDecimals: args.state.currencyDecimals,
    nowMs: args.nowMs,
  });
  await upsertCommunityPricePoint({
    ctx: args.ctx,
    communityId: args.communityId,
    billingPeriod: "annual",
    amountBaseUnits: args.state.annualAmount,
    name: args.state.nextName,
    description: args.state.nextOneLiner,
    currency: args.state.currency,
    currencyDecimals: args.state.currencyDecimals,
    nowMs: args.nowMs,
  });
}

// Pricing v2 (free dashboard): a community that ran only while its Builder plan
// was paid becomes free. Its plan, if any, stays attached as the community's
// Agent plan. Hand-run, in batches, until it reports none left; each change is
// audited.
export const migrateSubscriptionRequiredCommunitiesToFreeInternal = internalMutation({
  args: { limit: v.optional(v.number()), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 50)));
    const nowMs = Date.now();
    const changed: string[] = [];
    for await (const community of ctx.db.query("communities")) {
      if (changed.length >= limit) break;
      if (community.builderAccessMode !== COMMUNITY_BUILDER_ACCESS_SUBSCRIPTION_REQUIRED) continue;
      changed.push(String(community._id));
      if (args.dryRun) continue;
      await ctx.db.patch(community._id, { builderAccessMode: COMMUNITY_BUILDER_ACCESS_FREE, updatedAt: nowMs });
      await recordCriticalAuditEvent(ctx, {
        eventKey: `community_builder_access_freed:${String(community._id)}`,
        eventType: "community_builder_access_freed",
        severity: "info",
        status: "succeeded",
        communityId: community._id,
        provider: "polynet",
        metadata: { from: COMMUNITY_BUILDER_ACCESS_SUBSCRIPTION_REQUIRED, to: COMMUNITY_BUILDER_ACCESS_FREE },
        createdAt: nowMs,
      });
    }
    return { dryRun: args.dryRun === true, changed: changed.length, communityIds: changed };
  },
});

export const createCommunity = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    name: v.string(),
    slug: v.string(),
    visibility: v.optional(v.string()),
    avatarStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    avatarUrl: v.optional(v.union(v.string(), v.null())),
    avatarFocusX: v.optional(v.number()),
    avatarFocusY: v.optional(v.number()),
    avatarZoom: v.optional(v.number()),
    oneLiner: v.optional(v.union(v.string(), v.null())),
    bannerStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    bannerUrl: v.optional(v.union(v.string(), v.null())),
    bannerFocusX: v.optional(v.number()),
    bannerFocusY: v.optional(v.number()),
    bannerZoom: v.optional(v.number()),
    entryPolicy: v.optional(v.string()),
    founderSubscriptionId: v.optional(v.id("founderSubscriptions")),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    await requireAccountSetupCompleteForUser(ctx, ownerId);
    await requireNotTestMemberOutsideCommunity(ctx, ownerId);
    const nowMs = Date.now();
    const operatorComped = await hasPlatformOwnerComplimentaryAccess(ctx, ownerId);
    let founderSubscription: FounderSubscriptionRow | null = null;
    if (args.founderSubscriptionId) {
      founderSubscription = (await ctx.db.get(
        args.founderSubscriptionId,
      )) as FounderSubscriptionRow | null;
      if (
        !founderSubscription ||
        String(founderSubscription.ownerUserId) !== String(ownerId)
      ) {
        throw new Error("founder_subscription_forbidden");
      }
      if (founderSubscription.communityId) {
        throw new Error("founder_subscription_already_attached");
      }
      if (founderSubscription.riskAccessState === "revoked") {
        throw new Error("founder_subscription_risk_revoked");
      }
      if (
        founderSubscription.providerPriceId !== requireFounderStripePriceIdFromEnv()
      ) {
        throw new Error("founder_subscription_price_mismatch");
      }
      if (!founderSubscriptionStatusGrantsAccess({
        status: founderSubscription.status,
        currentPeriodEndAt: founderSubscription.currentPeriodEndAt,
        nowMs,
      })) {
        throw new Error("founder_subscription_inactive");
      }
    }
    // Creating is free; a plan bought first still attaches below. Without
    // payment as the brake, an owner has a bounded number of live communities;
    // a community created with its own verified Agent plan is never capped.
    if (!operatorComped && !founderSubscription) await requireOwnerBelowFreeCommunityLimit(ctx, ownerId);
    const slug = normalizeSlug(args.slug);
    const existing = await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (existing) throw new Error("community_slug_taken");

    const requestedVisibility = args.visibility === undefined
      ? "unlisted"
      : normalizeVisibility(args.visibility);
    const entryPolicy = normalizeEntryPolicy(args.entryPolicy, "approval");
    const avatarStorageId = args.avatarStorageId ?? undefined;
    const bannerStorageId = args.bannerStorageId ?? undefined;
    const name = normalizeName(args.name);
    const oneLiner = normalizeOptionalText(args.oneLiner);
    const avatarUrl = avatarStorageId ? undefined : normalizeOptionalCommunityImageUrl(args.avatarUrl);
    const bannerUrl = bannerStorageId ? undefined : normalizeOptionalCommunityImageUrl(args.bannerUrl);
    requireCommunityPublishReadinessTransition({
      currentVisibility: "unlisted",
      nextVisibility: requestedVisibility,
      current: {},
      next: {
        name,
        oneLiner,
        avatarUrl,
        avatarStorageId,
        bannerUrl,
        bannerStorageId,
      },
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug,
      name,
      lifecycleStatus: "active",
      lifecycleGeneration: 0,
      builderAccessMode: COMMUNITY_BUILDER_ACCESS_FREE,
      builderKnowledgeSetupPending: true,
      oneLiner,
      avatarUrl,
      avatarStorageId,
      avatarFocusX: normalizeAvatarFocus(args.avatarFocusX),
      avatarFocusY: normalizeAvatarFocus(args.avatarFocusY),
      avatarZoom: normalizeAvatarZoom(args.avatarZoom),
      bannerUrl,
      bannerStorageId,
      bannerFocusX: normalizeBannerFocus(args.bannerFocusX),
      bannerFocusY: normalizeBannerFocus(args.bannerFocusY),
      bannerZoom: normalizeBannerZoom(args.bannerZoom),
      brandingRevision: nowMs,
      settingsRevision: 0,
      visibility: requestedVisibility,
      inferenceFundingPolicy: COMMUNITY_FUNDING_POLICY_MANAGED,
      entryPolicy,
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await syncCommunityWeeklyDigestScheduleForCommunity(ctx, {
      communityId,
      nowMs,
    });
    if (founderSubscription) {
      await ctx.db.patch(founderSubscription._id, {
        communityId,
        attachedAt: nowMs,
        updatedAt: nowMs,
      });
      await syncFounderUsageCycle({
        ctx,
        subscription: {
          ...founderSubscription,
          communityId,
          attachedAt: nowMs,
          updatedAt: nowMs,
        },
        cycleStartAt: founderSubscription.currentPeriodStartAt,
        cycleEndAt: founderSubscription.currentPeriodEndAt,
        pricing: requireFounderInferencePricingFromEnv(),
        nowMs,
      });
    }
    await ensureCommunityPresenceBaseline({
      ctx,
      communityId,
      userId: ownerId,
      baselineAt: nowMs,
    });
    await ensureGeneralChannel({ ctx, communityId, nowMs });
    await ctx.scheduler.runAfter(
      0,
      internal.communityInteractions.createCommunityAgentCanonicalInteractionInternal,
      {
        userId: ownerId,
        communityId,
        idempotencyKey: communityFounderWelcomeIdempotencyKey(communityId),
        founderBootstrap: true,
      },
    );
    const created = (await ctx.db.get(communityId)) as CommunityLike | null;
    if (!created) throw new Error("community_create_failed");
    return await mapCommunityRecord(ctx, created);
  },
});

export const generateCommunityBrandingUploadUrl = mutation({
  args: {
    authSubject: v.optional(v.string()),
    kind: v.union(v.literal("avatar"), v.literal("banner")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await requireProfileSetupCompleteForUser(ctx, userId);
    const uploadUrl = await ctx.storage.generateUploadUrl();
    return {
      kind: args.kind,
      uploadUrl,
    };
  },
});

export const getCommunitySettings = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    return await mapCommunitySettingsSnapshot(ctx, community);
  },
});

export const saveCommunitySettings = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    expectedSettingsRevision: v.optional(v.number()),
    name: v.string(),
    slug: v.string(),
    oneLiner: v.optional(v.union(v.string(), v.null())),
    about: v.optional(v.union(v.string(), v.null())),
    avatarStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    avatarUrl: v.optional(v.union(v.string(), v.null())),
    avatarFocusX: v.optional(v.number()),
    avatarFocusY: v.optional(v.number()),
    avatarZoom: v.optional(v.number()),
    bannerStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    bannerUrl: v.optional(v.union(v.string(), v.null())),
    bannerFocusX: v.optional(v.number()),
    bannerFocusY: v.optional(v.number()),
    bannerZoom: v.optional(v.number()),
    visibility: v.optional(v.string()),
    monthlyAmountBaseUnits: v.optional(v.union(v.number(), v.null())),
    annualAmountBaseUnits: v.optional(v.union(v.number(), v.null())),
    currency: v.optional(v.string()),
    currencyDecimals: v.optional(v.number()),
  },
  handler: async (ctx, args) => await saveCommunitySettingsCore(ctx, args),
});

/** The settings save itself; Settings › Offers prices the base offer through it too. */
export async function saveCommunitySettingsCore(ctx: any, args: any) {
  const userId = await resolveUserIdForAuthenticatedRequest({
    ctx,
    userId: args.userId,
    authSubject: args.authSubject ?? null,
  });
  (args as { userId?: any }).userId = userId;
  const nowMs = Date.now();
  const { community } = await requireCommunityManager({
    ctx,
    communityId: args.communityId,
    userId: args.userId,
  });
  requireExpectedCommunitySettingsRevision(
    args.expectedSettingsRevision,
    community,
  );
  const currentPricing = await getCurrentCommunityPriceAmounts(ctx, args.communityId);
  const settingsState = resolveCommunitySettingsState(args, community, currentPricing);
  const existingBySlug = (await ctx.db
    .query("communities")
    .withIndex("by_slug", (q: any) => q.eq("slug", settingsState.normalizedSlug))
    .first()) as CommunityLike | null;
  if (existingBySlug && String(existingBySlug._id) !== String(args.communityId)) {
    throw new Error("community_slug_taken");
  }

  await requireCommunitySettingsPermissions({
    ctx,
    communityId: args.communityId,
    community,
    userId,
    state: settingsState,
    nowMs,
  });

  const previousAvatarStorageId = community.avatarStorageId;
  const previousBannerStorageId = community.bannerStorageId;

  await ctx.db.patch(community._id as any, {
    name: settingsState.nextName,
    slug: settingsState.normalizedSlug,
    oneLiner: settingsState.nextOneLiner,
    about: settingsState.nextAbout,
    avatarUrl: settingsState.nextAvatarUrl,
    avatarStorageId: settingsState.nextAvatarStorageId,
    avatarFocusX: settingsState.nextAvatarFocusX,
    avatarFocusY: settingsState.nextAvatarFocusY,
    avatarZoom: settingsState.nextAvatarZoom,
    bannerUrl: settingsState.nextBannerUrl,
    bannerStorageId: settingsState.nextBannerStorageId,
    bannerFocusX: settingsState.nextBannerFocusX,
    bannerFocusY: settingsState.nextBannerFocusY,
    bannerZoom: settingsState.nextBannerZoom,
    visibility: settingsState.nextVisibility,
    entryPolicy: settingsState.nextEntryPolicy,
    ...(
      settingsState.identityChanged || settingsState.brandingChanged
        ? { brandingRevision: nextCommunityBrandingRevision(community) }
        : null
    ),
    settingsRevision: resolveCommunitySettingsRevision(community) + 1,
    updatedAt: nowMs,
  });

  if (previousAvatarStorageId && String(previousAvatarStorageId) !== String(settingsState.nextAvatarStorageId ?? "")) {
    await maybeDeleteStorageAsset(ctx, previousAvatarStorageId);
  }
  if (previousBannerStorageId && String(previousBannerStorageId) !== String(settingsState.nextBannerStorageId ?? "")) {
    await maybeDeleteStorageAsset(ctx, previousBannerStorageId);
  }

  await upsertCommunitySettingsPricePoints({
    ctx,
    communityId: args.communityId,
    state: settingsState,
    nowMs,
  });

  const updated = (await ctx.db.get(community._id as any)) as CommunityLike | null;
  if (!updated) throw new Error("community_not_found");
  return await mapCommunitySettingsSnapshot(ctx, updated);
  
}

export const saveCommunityAbout = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    about: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const nowMs = Date.now();
    const about = normalizeOptionalText(args.about, 8_000);
    await ctx.db.patch(community._id as any, {
      about,
      settingsRevision: resolveCommunitySettingsRevision(community) + 1,
      updatedAt: nowMs,
    });
    return {
      community_id: String(community._id),
      about: about ?? null,
      updated_at: toIsoString(nowMs),
      settings_revision: resolveCommunitySettingsRevision(community) + 1,
    };
  },
});

export const deleteCommunity = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityOwner({
      ctx,
      communityId: args.communityId,
      userId,
    });

    throw new ConvexError({
      code: COMMUNITY_DELETION_QUARANTINE_CODE,
      reason: COMMUNITY_DELETION_QUARANTINE_CODE,
    });
  },
});
