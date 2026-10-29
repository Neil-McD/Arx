import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  adjustCommunityActiveMemberCountForMembershipTransition,
  communityMembershipRowIsActive,
  communityUserIsBlocked,
  getUniqueCommunityMembershipByPair,
  normalizeIdValue,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import {
  communityAccessMemberPayload,
  computeCommunityMemberAccess,
  ensureCommunityAccessMemberId,
  enqueueCommunityAccessEvent,
  integrationInput,
  isTestMemberUser,
  listActiveCommunityAccessIntegrations,
  projectCommunityAccessGrant,
  projectCommunityLicenseKey,
  readActiveCommunityAccessGrant,
  readActiveCommunityLicenseKey,
  readDecidingCommunitySubscription,
  syncCommunityAccessForUser,
} from "./communityAccessSync";
import { decryptCommunityAccessSecret, encryptCommunityAccessSecret } from "./communityAccessSecrets";
import { normalizeEmailForVerification } from "./workosEmailVerification";
import {
  COMMUNITY_ACCESS_SIGN_IN_CODE_TTL_MS,
  communityAccessReturnUrlFor,
  communityAccessSignInCodeLooksValid,
  newCommunityAccessSignInCode,
  COMMUNITY_ACCESS_DELIVERY_WINDOW_MS,
  COMMUNITY_ACCESS_INTEGRATION_LIMIT,
  CommunityAccessError,
  communityAccessApiKeyLooksValid,
  communityAccessDeliveryShouldRetry,
  communityAccessRetryDelayMs,
  communityIntegrationCoversAccess,
  communityLicenseKeyLooksValid,
  newCommunityAccessApiKey,
  newCommunityAccessEventId,
  newCommunityAccessSigningSecret,
  newCommunityLicenseKey,
  normalizeCommunityAccessGrantEnd,
  normalizeCommunityAccessGrantReason,
  normalizeCommunityAccessIntegrationName,
  normalizeCommunityAccessWebhookUrl,
  sha256HexOf,
  signCommunityAccessWebhook,
} from "../shared/communityAccess";

// Who can use what, and until when: the owner's dated access grants, each
// member's license key, and the access integrations (an outside service such
// as a paid MCP server) that learn about every change through a signed webhook and
// can look a member up. Access itself is never stored here; it is read from
// the membership, subscription and grant every time (communityAccessSync.ts).

const toIso = (ms: number | null | undefined) => (typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null);
const managerArgs = { userId: v.id("users"), communityId: v.id("communities") };
const viaArg = { via: v.optional(v.union(v.literal("web"), v.literal("agent"))) };
const DELIVERY_LEASE_MS = 60_000;
const DELIVERY_TIMEOUT_MS = 10_000;
const SWEEP_PAGE_SIZE = 40;
const EVENTS_PAGE_SIZE = 25;
const LOOKUP_LIST_PAGE_SIZE = 50;

function localDeployment(): boolean {
  if (String(process.env.POLYNET_ACCESS_ALLOW_LOOPBACK_WEBHOOKS ?? "").trim() === "1") return true;
  const site = String(process.env.CONVEX_SITE_URL ?? "").trim();
  return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/i.test(site);
}

async function requireMembershipInCommunity(ctx: any, communityId: any, membershipId: string) {
  const id = ctx.db.normalizeId("communityMemberships", membershipId);
  const membership = id ? await ctx.db.get(id) : null;
  if (!membership || normalizeIdValue(membership.communityId) !== normalizeIdValue(communityId)) {
    throw new CommunityAccessError("community_client_not_found");
  }
  return membership;
}

// ---------------------------------------------------------------------------
// Owner grants

// Ends a member's access that came from an owner grant: the grant row records
// who and why, and a membership held only by the grant is revoked in the same
// write, so community reads and every integration see it at once.
async function endGrantAndAccess(ctx: any, args: {
  communityId: any;
  userId: any;
  grant: any | null;
  actorUserId?: any;
  endedReason: string;
  nowMs: number;
}) {
  if (args.grant) {
    if (args.grant.endJobId && args.endedReason !== "expired") {
      try { await ctx.scheduler.cancel(args.grant.endJobId); } catch { /* already ran */ }
    }
    await ctx.db.patch(args.grant._id, {
      status: "ended", endedAt: args.nowMs, endedReason: args.endedReason, endJobId: undefined, updatedAt: args.nowMs,
      ...(args.actorUserId ? { endedByUserId: args.actorUserId } : {}),
    });
  }
  const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId: args.communityId, userId: args.userId });
  if (membership && communityMembershipRowIsActive(membership) && membership.accessSource === "manual_grant") {
    const revoked = { ...membership, active: false, revokedAt: args.nowMs, revokedReason: "access_grant_ended", updatedAt: args.nowMs };
    await ctx.db.patch(membership._id, { active: false, revokedAt: args.nowMs, revokedReason: "access_grant_ended", updatedAt: args.nowMs });
    await adjustCommunityActiveMemberCountForMembershipTransition({ ctx, communityId: args.communityId, before: membership, after: revoked });
  }
  await syncCommunityAccessForUser(ctx, { communityId: args.communityId, userId: args.userId, nowMs: args.nowMs, reason: args.endedReason === "expired" ? "access_grant_expired" : "access_grant_ended" });
}

async function resolveGrantTarget(ctx: any, args: { communityId: any; membershipId?: string; email?: string }) {
  if (args.membershipId) {
    const membership = await requireMembershipInCommunity(ctx, args.communityId, args.membershipId);
    return membership.userId;
  }
  if (args.email !== undefined) {
    const email = normalizeEmailForVerification(args.email);
    if (!email) throw new CommunityAccessError("access_grant_email_invalid");
    const users = await ctx.db.query("users").withIndex("by_normalizedEmail", (q: any) => q.eq("normalizedEmail", email)).take(5);
    // Only a verified address may receive access, so nobody can claim a grant
    // meant for someone else by signing up with their email unverified.
    const verified = users.filter((user: any) => typeof user.emailVerifiedAt === "number");
    if (!verified.length) throw new CommunityAccessError("access_grant_user_not_found");
    if (verified.length > 1) throw new CommunityAccessError("access_grant_email_ambiguous");
    return verified[0]._id;
  }
  throw new CommunityAccessError("access_grant_target_required");
}

const grantArgs = {
  ...managerArgs, ...viaArg,
  membershipId: v.optional(v.string()),
  email: v.optional(v.string()),
  // ISO date or instant, epoch ms, or null for no end date.
  endsAt: v.optional(v.union(v.string(), v.number(), v.null())),
  reason: v.string(),
  // Which offer this access is for (Settings › Offers); the base offer when left out.
  offerKey: v.optional(v.string()),
};

// Give someone access by hand, or change the end date or reason of the access
// already given. Each change ends the old grant and starts a new one, so the
// history shows every who, why and until when.
async function grantAccess(ctx: any, args: any) {
  const nowMs = Date.now();
  const { community } = await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  const reason = normalizeCommunityAccessGrantReason(args.reason);
  const endsAt = normalizeCommunityAccessGrantEnd(args.endsAt, nowMs);
  const targetUserId = await resolveGrantTarget(ctx, args);
  const offerKey = args.offerKey ? String(args.offerKey).trim() : null;
  if (offerKey) {
    const offer = await ctx.db.query("communityOffers")
      .withIndex("by_community_key", (q: any) => q.eq("communityId", args.communityId).eq("key", offerKey)).unique();
    if (!offer || offer.archivedAt) throw new CommunityAccessError("access_grant_offer_unavailable");
  }
  if (normalizeIdValue(community.ownerId) === normalizeIdValue(targetUserId)) throw new CommunityAccessError("access_grant_owner");
  if (await communityUserIsBlocked({ ctx, communityId: args.communityId, userId: targetUserId })) {
    throw new CommunityAccessError("access_grant_user_blocked");
  }
  const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId: args.communityId, userId: targetUserId });
  if (membership && communityMembershipRowIsActive(membership) && membership.accessSource === "paid_subscription") {
    const subscription = await readDecidingCommunitySubscription(ctx, membership._id);
    const status = String(subscription?.status ?? "active");
    if (!subscription || status === "active" || status === "past_due" || status === "cancel_at_period_end") {
      throw new CommunityAccessError("access_grant_member_paying");
    }
  }
  let held: any = membership;
  if (!membership || !communityMembershipRowIsActive(membership) || membership.accessSource !== "manual_grant") {
    const activation = await activateCommunityMembershipCore({
      ctx, communityId: args.communityId, userId: targetUserId, accessSource: "manual_grant",
      activationReason: "owner_access_grant", nowMs, skipAccessSync: true,
    });
    held = activation.membership;
  }
  const previous = await readActiveCommunityAccessGrant(ctx, args.communityId, targetUserId);
  if (previous) {
    if (previous.endJobId) { try { await ctx.scheduler.cancel(previous.endJobId); } catch { /* already ran */ } }
    await ctx.db.patch(previous._id, {
      status: "ended", endedAt: nowMs, endedByUserId: args.userId, endedReason: "replaced", endJobId: undefined, updatedAt: nowMs,
    });
  }
  const grantId = await ctx.db.insert("communityAccessGrants", {
    communityId: args.communityId, userId: targetUserId, membershipId: held._id, status: "active",
    ...(endsAt === null ? {} : { endsAt }), reason, grantedByUserId: args.userId, grantedVia: args.via ?? "web",
    ...(offerKey ? { offerKey } : {}),
    createdAt: nowMs, updatedAt: nowMs,
  });
  if (endsAt !== null) {
    const endJobId = await ctx.scheduler.runAt(endsAt, (internal as any).communityAccess.endDueAccessGrantInternal, { grantId });
    await ctx.db.patch(grantId, { endJobId });
  }
  await syncCommunityAccessForUser(ctx, { communityId: args.communityId, userId: targetUserId, nowMs, reason: previous ? "access_grant_changed" : "access_granted" });
  const grant = await ctx.db.get(grantId);
  return { membership_id: String(held._id), grant: projectCommunityAccessGrant(grant), replaced_grant_id: previous ? String(previous._id) : null };
}

const endAccessArgs = { ...managerArgs, ...viaArg, membershipId: v.string() };

// End access the owner gave, now. Paid plans end through billing (or Remove
// member), never here, so a payment is never left running without access.
async function endAccess(ctx: any, args: any) {
  const nowMs = Date.now();
  await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  const membership = await requireMembershipInCommunity(ctx, args.communityId, args.membershipId);
  const grant = await readActiveCommunityAccessGrant(ctx, args.communityId, membership.userId);
  const heldByGrant = communityMembershipRowIsActive(membership) && membership.accessSource === "manual_grant";
  if (!grant && !heldByGrant) throw new CommunityAccessError("access_grant_not_found");
  await endGrantAndAccess(ctx, { communityId: args.communityId, userId: membership.userId, grant, actorUserId: args.userId, endedReason: "ended_by_owner", nowMs });
  return { membership_id: String(membership._id), ended: true };
}

export const endDueAccessGrantInternal = internalMutation({
  args: { grantId: v.id("communityAccessGrants") },
  handler: async (ctx, args) => {
    const grant = await ctx.db.get(args.grantId);
    const nowMs = Date.now();
    if (!grant || grant.status !== "active" || typeof grant.endsAt !== "number" || grant.endsAt > nowMs + 1_000) return { ended: false };
    await endGrantAndAccess(ctx, { communityId: grant.communityId, userId: grant.userId, grant, endedReason: "expired", nowMs });
    return { ended: true };
  },
});

// ---------------------------------------------------------------------------
// License keys

async function createOwnLicenseKey(ctx: any, args: { userId: any; communityId: any }) {
  const nowMs = Date.now();
  const community = await ctx.db.get(args.communityId);
  if (!community) throw new CommunityAccessError("community_not_found");
  const { access } = await computeCommunityMemberAccess(ctx, { community, userId: args.userId, nowMs });
  if (!access.entitled) throw new CommunityAccessError("license_key_requires_access");
  const existing = await readActiveCommunityLicenseKey(ctx, args.communityId, args.userId);
  if (existing) await ctx.db.patch(existing._id, { status: "rotated", revokedAt: nowMs });
  const key = newCommunityLicenseKey(community.slug);
  await ctx.db.insert("communityMemberLicenseKeys", {
    communityId: args.communityId, userId: args.userId, keyHash: await sha256HexOf(key), last4: key.slice(-4), status: "active", createdAt: nowMs,
  });
  await ensureCommunityAccessMemberId(ctx, args.communityId, args.userId, nowMs);
  return { key, last4: key.slice(-4), rotated: Boolean(existing), created_at: toIso(nowMs) };
}

const revokeKeyArgs = { ...managerArgs, membershipId: v.string() };

async function revokeClientLicenseKey(ctx: any, args: any) {
  const nowMs = Date.now();
  await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  const membership = await requireMembershipInCommunity(ctx, args.communityId, args.membershipId);
  const key = await readActiveCommunityLicenseKey(ctx, args.communityId, membership.userId);
  if (!key) throw new CommunityAccessError("license_key_not_found");
  await ctx.db.patch(key._id, { status: "revoked", revokedAt: nowMs, revokedByUserId: args.userId });
  return { membership_id: String(membership._id), revoked: true };
}

// ---------------------------------------------------------------------------
// Reads for the owner (Clients) and the member (Membership page)

const clientAccessArgs = { ...managerArgs, membershipId: v.string() };

async function readClientAccess(ctx: any, args: any) {
  const nowMs = Date.now();
  const { community } = await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  const membership = await requireMembershipInCommunity(ctx, args.communityId, args.membershipId);
  const integrations = await listActiveCommunityAccessIntegrations(ctx, args.communityId);
  const computed = await computeCommunityMemberAccess(ctx, { community, userId: membership.userId, nowMs, membership, integrations });
  const [grants, key, events] = await Promise.all([
    ctx.db.query("communityAccessGrants").withIndex("by_membership_createdAt", (q: any) => q.eq("membershipId", membership._id)).order("desc").take(20),
    readActiveCommunityLicenseKey(ctx, args.communityId, membership.userId),
    ctx.db.query("communityAccessEvents")
      .withIndex("by_community_user_createdAt", (q: any) => q.eq("communityId", args.communityId).eq("userId", membership.userId))
      .order("desc").take(20),
  ]);
  return {
    kind: "community_client_access",
    membership_id: String(membership._id),
    read_at: new Date(nowMs).toISOString(),
    access: computed.access,
    is_test_member: computed.isTestMember,
    grant: computed.grant ? projectCommunityAccessGrant(computed.grant) : null,
    grants: grants.map(projectCommunityAccessGrant),
    license_key: projectCommunityLicenseKey(key),
    integrations: integrations.map((integration: any) => {
      const last = events.find((event: any) => normalizeIdValue(event.integrationId) === normalizeIdValue(integration._id));
      return {
        id: String(integration._id),
        name: integration.name,
        entitled: communityIntegrationCoversAccess(computed.access, integrationInput(integration), { isTestMember: computed.isTestMember }),
        last_event: last ? {
          event_id: last.eventId,
          entitled: last.entitled ?? null,
          status: last.status,
          created_at: toIso(last.createdAt),
          delivered_at: toIso(last.deliveredAt),
          last_error_code: last.lastErrorCode ?? null,
        } : null,
      };
    }),
  };
}

async function readOwnAccess(ctx: any, args: { userId: any; communityId: any }) {
  const nowMs = Date.now();
  const community = await ctx.db.get(args.communityId);
  if (!community) throw new CommunityAccessError("community_not_found");
  const integrations = await listActiveCommunityAccessIntegrations(ctx, args.communityId);
  const computed = await computeCommunityMemberAccess(ctx, { community, userId: args.userId, nowMs, integrations });
  const key = await readActiveCommunityLicenseKey(ctx, args.communityId, args.userId);
  return {
    kind: "community_member_access",
    community: { id: String(community._id), slug: community.slug, name: community.name },
    access: computed.access,
    // A key only matters when a service checks it, so the card shows only then.
    license_key_available: integrations.length > 0 && !computed.isTestMember,
    license_key: projectCommunityLicenseKey(key),
  };
}

// ---------------------------------------------------------------------------
// Access integrations (owner setup)

function projectIntegration(row: any) {
  return {
    id: String(row._id),
    name: row.name,
    webhook_url: row.webhookUrl,
    price_point_ids: (row.pricePointIds ?? []).map((id: any) => String(id)),
    include_owner_grants: row.includeOwnerGrants !== false,
    status: row.status,
    api_key_last4: row.apiKeyLast4,
    signing_secret_last4: row.signingSecretLast4,
    created_at: toIso(row.createdAt),
    last_delivered_at: toIso(row.lastDeliveredAt),
    last_failed_at: toIso(row.lastFailedAt),
    last_error_code: row.lastErrorCode ?? null,
    last_lookup_at: toIso(row.lastLookupAt),
  };
}

async function requireIntegrationInCommunity(ctx: any, communityId: any, integrationId: string) {
  const id = ctx.db.normalizeId("communityAccessIntegrations", integrationId);
  const row = id ? await ctx.db.get(id) : null;
  if (!row || normalizeIdValue(row.communityId) !== normalizeIdValue(communityId)) throw new CommunityAccessError("access_integration_not_found");
  return row;
}

async function normalizePricePointIds(ctx: any, communityId: any, raw: unknown) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 20) throw new CommunityAccessError("access_integration_plans_invalid");
  const ids: any[] = [];
  for (const value of raw) {
    const id = ctx.db.normalizeId("communityPricePoints", String(value));
    const row = id ? await ctx.db.get(id) : null;
    if (!row || normalizeIdValue(row.communityId) !== normalizeIdValue(communityId)) throw new CommunityAccessError("access_integration_plans_invalid");
    if (!ids.some((known) => normalizeIdValue(known) === normalizeIdValue(row._id))) ids.push(row._id);
  }
  return ids;
}

// Where an integration calls the lookup API for this community.
function lookupUrlFor(community: any): string | null {
  const site = String(process.env.CONVEX_SITE_URL ?? "").trim().replace(/\/+$/, "");
  return site ? `${site}/access/v1/communities/${encodeURIComponent(community.slug)}` : null;
}

async function listIntegrations(ctx: any, args: any) {
  const { community } = await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  const [rows, pricePoints] = await Promise.all([
    ctx.db.query("communityAccessIntegrations").withIndex("by_community", (q: any) => q.eq("communityId", args.communityId)).take(50),
    ctx.db.query("communityPricePoints").withIndex("by_community", (q: any) => q.eq("communityId", args.communityId)).take(50),
  ]);
  return {
    integrations: rows.filter((row: any) => row.status === "active").sort((a: any, b: any) => a.createdAt - b.createdAt).map(projectIntegration),
    price_points: pricePoints.filter((row: any) => !row.archivedAt).map((row: any) => ({
      id: String(row._id), name: row.name, billing_period: row.billingPeriod, amount_base_units: row.amountBaseUnits,
      currency: row.currency, currency_decimals: row.currencyDecimals, is_current: row.isCurrent,
    })),
    loopback_webhooks_allowed: localDeployment(),
    lookup_url: lookupUrlFor(community),
  };
}

async function scheduleSweep(ctx: any, integrationId: any, nowMs: number) {
  await ctx.db.patch(integrationId, { sweepCursor: undefined, sweepStartedAt: nowMs });
  await ctx.scheduler.runAfter(0, (internal as any).communityAccess.sweepIntegrationPageInternal, { integrationId, cursor: null });
}

const createIntegrationArgs = {
  ...managerArgs,
  name: v.string(),
  webhookUrl: v.string(),
  pricePointIds: v.optional(v.array(v.string())),
  includeOwnerGrants: v.optional(v.boolean()),
};

async function createIntegration(ctx: any, args: any) {
  const nowMs = Date.now();
  await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  const name = normalizeCommunityAccessIntegrationName(args.name);
  const webhookUrl = normalizeCommunityAccessWebhookUrl(args.webhookUrl, { allowLoopback: localDeployment() });
  const pricePointIds = await normalizePricePointIds(ctx, args.communityId, args.pricePointIds);
  const active = await listActiveCommunityAccessIntegrations(ctx, args.communityId);
  if (active.length >= COMMUNITY_ACCESS_INTEGRATION_LIMIT) throw new CommunityAccessError("access_integration_limit_reached");
  const apiKey = newCommunityAccessApiKey();
  const signingSecret = newCommunityAccessSigningSecret();
  const encrypted = await encryptCommunityAccessSecret(signingSecret);
  const integrationId = await ctx.db.insert("communityAccessIntegrations", {
    communityId: args.communityId, name, webhookUrl, pricePointIds, includeOwnerGrants: args.includeOwnerGrants !== false,
    status: "active", apiKeyHash: await sha256HexOf(apiKey), apiKeyLast4: apiKey.slice(-4),
    encryptedSigningSecretHex: encrypted.encryptedHex, signingSecretIvHex: encrypted.ivHex, signingSecretLast4: signingSecret.slice(-4),
    createdByUserId: args.userId, createdAt: nowMs, updatedAt: nowMs,
  });
  // Tell the new service about everyone who already has access.
  await scheduleSweep(ctx, integrationId, nowMs);
  const row = await ctx.db.get(integrationId);
  return { integration: projectIntegration(row), api_key: apiKey, signing_secret: signingSecret };
}

const updateIntegrationArgs = {
  ...managerArgs,
  integrationId: v.string(),
  name: v.optional(v.string()),
  webhookUrl: v.optional(v.string()),
  pricePointIds: v.optional(v.array(v.string())),
  includeOwnerGrants: v.optional(v.boolean()),
};

async function updateIntegration(ctx: any, args: any) {
  const nowMs = Date.now();
  await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  const row = await requireIntegrationInCommunity(ctx, args.communityId, args.integrationId);
  if (row.status !== "active") throw new CommunityAccessError("access_integration_revoked");
  const patch: Record<string, unknown> = { updatedAt: nowMs };
  if (args.name !== undefined) patch.name = normalizeCommunityAccessIntegrationName(args.name);
  if (args.webhookUrl !== undefined) patch.webhookUrl = normalizeCommunityAccessWebhookUrl(args.webhookUrl, { allowLoopback: localDeployment() });
  if (args.pricePointIds !== undefined) patch.pricePointIds = await normalizePricePointIds(ctx, args.communityId, args.pricePointIds);
  if (args.includeOwnerGrants !== undefined) patch.includeOwnerGrants = args.includeOwnerGrants;
  await ctx.db.patch(row._id, patch);
  // Who it covers may have changed: walk the members again.
  if (args.pricePointIds !== undefined || args.includeOwnerGrants !== undefined || args.name !== undefined) await scheduleSweep(ctx, row._id, nowMs);
  return { integration: projectIntegration(await ctx.db.get(row._id)) };
}

const rotateArgs = { ...managerArgs, integrationId: v.string(), which: v.union(v.literal("api_key"), v.literal("signing_secret")) };

async function rotateIntegrationSecret(ctx: any, args: any) {
  await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  const row = await requireIntegrationInCommunity(ctx, args.communityId, args.integrationId);
  if (row.status !== "active") throw new CommunityAccessError("access_integration_revoked");
  if (args.which === "api_key") {
    const apiKey = newCommunityAccessApiKey();
    await ctx.db.patch(row._id, { apiKeyHash: await sha256HexOf(apiKey), apiKeyLast4: apiKey.slice(-4), updatedAt: Date.now() });
    return { integration: projectIntegration(await ctx.db.get(row._id)), api_key: apiKey };
  }
  const signingSecret = newCommunityAccessSigningSecret();
  const encrypted = await encryptCommunityAccessSecret(signingSecret);
  await ctx.db.patch(row._id, {
    encryptedSigningSecretHex: encrypted.encryptedHex, signingSecretIvHex: encrypted.ivHex, signingSecretLast4: signingSecret.slice(-4), updatedAt: Date.now(),
  });
  return { integration: projectIntegration(await ctx.db.get(row._id)), signing_secret: signingSecret };
}

const integrationArgs = { ...managerArgs, integrationId: v.string() };

async function revokeIntegration(ctx: any, args: any) {
  const nowMs = Date.now();
  await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  const row = await requireIntegrationInCommunity(ctx, args.communityId, args.integrationId);
  if (row.status === "revoked") return { revoked: true };
  await ctx.db.patch(row._id, { status: "revoked", revokedAt: nowMs, updatedAt: nowMs });
  return { revoked: true };
}

async function sendIntegrationTest(ctx: any, args: any) {
  const nowMs = Date.now();
  const { community } = await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  const row = await requireIntegrationInCommunity(ctx, args.communityId, args.integrationId);
  if (row.status !== "active") throw new CommunityAccessError("access_integration_revoked");
  const eventId = newCommunityAccessEventId();
  await enqueueCommunityAccessEvent(ctx, {
    communityId: args.communityId, integrationId: row._id, type: "integration.test", nowMs,
    payload: { type: "integration.test", event_id: eventId, community: { slug: community.slug, name: community.name }, occurred_at: new Date(nowMs).toISOString() },
  });
  return { event_id: eventId };
}

function projectEvent(row: any) {
  return {
    event_id: row.eventId,
    type: row.type,
    member_id: row.memberId ?? null,
    member_email: row.payload?.member?.email ?? null,
    entitled: row.entitled ?? null,
    status: row.status,
    attempt_count: row.attemptCount,
    response_status: row.responseStatus ?? null,
    last_error_code: row.lastErrorCode ?? null,
    created_at: toIso(row.createdAt),
    delivered_at: toIso(row.deliveredAt),
    next_attempt_at: toIso(row.nextAttemptAt),
  };
}

async function listIntegrationEvents(ctx: any, args: any) {
  await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  const row = await requireIntegrationInCommunity(ctx, args.communityId, args.integrationId);
  const events = await ctx.db.query("communityAccessEvents")
    .withIndex("by_integration_createdAt", (q: any) => q.eq("integrationId", row._id)).order("desc").take(EVENTS_PAGE_SIZE);
  return { integration_id: String(row._id), events: events.map(projectEvent) };
}

const retryEventArgs = { ...managerArgs, integrationId: v.string(), eventId: v.string() };

async function retryIntegrationEvent(ctx: any, args: any) {
  const nowMs = Date.now();
  await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  const row = await requireIntegrationInCommunity(ctx, args.communityId, args.integrationId);
  const events = await ctx.db.query("communityAccessEvents")
    .withIndex("by_integration_createdAt", (q: any) => q.eq("integrationId", row._id)).order("desc").take(200);
  const event = events.find((candidate: any) => candidate.eventId === args.eventId);
  if (!event) throw new CommunityAccessError("access_event_not_found");
  if (event.status !== "needs_attention") return { status: event.status };
  // A retried event gets a fresh 72-hour window from now.
  await ctx.db.patch(event._id, {
    status: "pending", attemptCount: 0, attemptToken: undefined, leaseExpiresAt: undefined, nextAttemptAt: nowMs,
    lastErrorCode: undefined, createdAt: nowMs, updatedAt: nowMs,
  });
  await ctx.scheduler.runAfter(0, (internal as any).communityAccess.deliverAccessEventInternal, { eventRowId: event._id });
  return { status: "pending" };
}

// ---------------------------------------------------------------------------
// Delivery: claim with a lease, sign, POST, record. A stale lease or a missed
// schedule is picked up by the recovery cron.

export const claimAccessEventInternal = internalMutation({
  args: { eventRowId: v.id("communityAccessEvents"), nowMs: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.eventRowId);
    if (!row) return { status: "missing" as const };
    if (row.status === "delivered" || row.status === "needs_attention") return { status: row.status };
    if (row.status === "delivering" && typeof row.leaseExpiresAt === "number" && row.leaseExpiresAt > args.nowMs) return { status: "busy" as const };
    if (row.status === "pending" && typeof row.nextAttemptAt === "number" && row.nextAttemptAt > args.nowMs + 1_000) return { status: "not_due" as const };
    const integration = await ctx.db.get(row.integrationId);
    const expired = args.nowMs > row.createdAt + COMMUNITY_ACCESS_DELIVERY_WINDOW_MS;
    if (!integration || integration.status !== "active" || expired) {
      await ctx.db.patch(row._id, {
        status: "needs_attention", attemptToken: undefined, leaseExpiresAt: undefined, nextAttemptAt: undefined,
        lastErrorCode: !integration || integration.status !== "active" ? "integration_revoked" : "delivery_window_expired", updatedAt: args.nowMs,
      });
      return { status: "needs_attention" as const };
    }
    const attemptCount = row.attemptCount + 1;
    const attemptToken = crypto.randomUUID();
    await ctx.db.patch(row._id, {
      status: "delivering", attemptCount, attemptToken, leaseExpiresAt: args.nowMs + DELIVERY_LEASE_MS, nextAttemptAt: undefined, updatedAt: args.nowMs,
    });
    return { status: "claimed" as const, attemptToken, attemptCount };
  },
});

export const readAccessEventDeliveryInputInternal = internalQuery({
  args: { eventRowId: v.id("communityAccessEvents"), attemptToken: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.eventRowId);
    if (!row || row.status !== "delivering" || row.attemptToken !== args.attemptToken) return null;
    const integration = await ctx.db.get(row.integrationId);
    if (!integration || integration.status !== "active") return null;
    return {
      webhookUrl: integration.webhookUrl,
      encryptedHex: integration.encryptedSigningSecretHex,
      ivHex: integration.signingSecretIvHex,
      eventId: row.eventId,
      type: row.type,
      body: JSON.stringify(row.payload),
    };
  },
});

export const completeAccessEventInternal = internalMutation({
  args: { eventRowId: v.id("communityAccessEvents"), attemptToken: v.string(), responseStatus: v.number(), nowMs: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.eventRowId);
    if (!row || row.status !== "delivering" || row.attemptToken !== args.attemptToken) return { ok: false };
    await ctx.db.patch(row._id, {
      status: "delivered", responseStatus: args.responseStatus, deliveredAt: args.nowMs, attemptToken: undefined,
      leaseExpiresAt: undefined, lastErrorCode: undefined, updatedAt: args.nowMs,
    });
    await ctx.db.patch(row.integrationId, { lastDeliveredAt: args.nowMs });
    return { ok: true };
  },
});

export const recordAccessEventFailureInternal = internalMutation({
  args: {
    eventRowId: v.id("communityAccessEvents"), attemptToken: v.string(), responseStatus: v.optional(v.number()),
    errorCode: v.string(), retryable: v.boolean(), nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.eventRowId);
    if (!row || row.attemptToken !== args.attemptToken) return { ok: false };
    const nextAttemptAt = args.nowMs + communityAccessRetryDelayMs(row.attemptCount);
    const retry = args.retryable && nextAttemptAt <= row.createdAt + COMMUNITY_ACCESS_DELIVERY_WINDOW_MS;
    await ctx.db.patch(row._id, {
      status: retry ? "pending" : "needs_attention",
      ...(args.responseStatus === undefined ? {} : { responseStatus: args.responseStatus }),
      lastErrorCode: args.errorCode.slice(0, 120),
      nextAttemptAt: retry ? nextAttemptAt : undefined,
      attemptToken: undefined, leaseExpiresAt: undefined, updatedAt: args.nowMs,
    });
    await ctx.db.patch(row.integrationId, { lastFailedAt: args.nowMs, lastErrorCode: args.errorCode.slice(0, 120) });
    if (retry) {
      await ctx.scheduler.runAt(nextAttemptAt, (internal as any).communityAccess.deliverAccessEventInternal, { eventRowId: row._id });
    }
    return { ok: true, retry, nextAttemptAt: retry ? nextAttemptAt : null };
  },
});

export const recoverDueAccessEventsInternal = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const limit = Math.min(50, Math.max(1, Math.floor(args.limit ?? 25)));
    const [pending, expiredLeases] = await Promise.all([
      ctx.db.query("communityAccessEvents").withIndex("by_status_next_attempt_at", (q) => q.eq("status", "pending").lte("nextAttemptAt", nowMs)).take(limit),
      ctx.db.query("communityAccessEvents").withIndex("by_status_lease_expires_at", (q) => q.eq("status", "delivering").lte("leaseExpiresAt", nowMs)).take(limit),
    ]);
    const rows = [...pending, ...expiredLeases].slice(0, limit);
    for (const row of rows) {
      await ctx.scheduler.runAfter(0, (internal as any).communityAccess.deliverAccessEventInternal, { eventRowId: row._id });
    }
    return { scheduled: rows.length };
  },
});

export const deliverAccessEventInternal: any = internalAction({
  args: { eventRowId: v.id("communityAccessEvents") },
  handler: async (ctx, args): Promise<any> => {
    const claim: any = await ctx.runMutation((internal as any).communityAccess.claimAccessEventInternal, { eventRowId: args.eventRowId, nowMs: Date.now() });
    if (claim.status !== "claimed") return claim;
    const fail = (errorCode: string, retryable: boolean, responseStatus?: number) =>
      ctx.runMutation((internal as any).communityAccess.recordAccessEventFailureInternal, {
        eventRowId: args.eventRowId, attemptToken: claim.attemptToken, errorCode, retryable, nowMs: Date.now(),
        ...(responseStatus === undefined ? {} : { responseStatus }),
      });
    const input: any = await ctx.runQuery((internal as any).communityAccess.readAccessEventDeliveryInputInternal, {
      eventRowId: args.eventRowId, attemptToken: claim.attemptToken,
    });
    if (!input) return fail("integration_revoked", false);
    let url: string;
    try {
      url = normalizeCommunityAccessWebhookUrl(input.webhookUrl, { allowLoopback: localDeployment() });
    } catch (error) {
      return fail(error instanceof CommunityAccessError ? error.code : "access_webhook_url_invalid", false);
    }
    let secret: string;
    try {
      secret = await decryptCommunityAccessSecret({ encryptedHex: input.encryptedHex, ivHex: input.ivHex });
    } catch {
      return fail("signing_secret_unreadable", false);
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await signCommunityAccessWebhook(secret, timestamp, input.body);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    let responseStatus: number | undefined;
    try {
      const response = await fetch(url, {
        method: "POST",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "user-agent": "Polynet-Access-Webhooks/1",
          "polynet-signature": signature,
          "polynet-event-id": input.eventId,
          "polynet-event-type": input.type,
          "polynet-delivery-attempt": String(claim.attemptCount),
        },
        body: input.body,
      });
      responseStatus = response.status;
      try { await response.text(); } catch { /* body is not needed */ }
      if (response.status >= 200 && response.status < 300) {
        return ctx.runMutation((internal as any).communityAccess.completeAccessEventInternal, {
          eventRowId: args.eventRowId, attemptToken: claim.attemptToken, responseStatus: response.status, nowMs: Date.now(),
        });
      }
      return fail(`http_${response.status}`, communityAccessDeliveryShouldRetry(response.status), response.status);
    } catch (error) {
      const aborted = (error as { name?: string } | null)?.name === "AbortError";
      return fail(aborted ? "timeout" : "request_failed", true, responseStatus);
    } finally {
      clearTimeout(timer);
    }
  },
});

// ---------------------------------------------------------------------------
// The sweep: every integration walks its community's memberships in pages, so
// a change from any path (or a missed write) still reaches the service. It
// also ends any grant whose end job did not run.

export const sweepIntegrationPageInternal = internalMutation({
  args: { integrationId: v.id("communityAccessIntegrations"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const integration = await ctx.db.get(args.integrationId);
    if (!integration || integration.status !== "active") return { done: true };
    const nowMs = Date.now();
    const page = await ctx.db.query("communityMemberships")
      .withIndex("by_community", (q) => q.eq("communityId", integration.communityId))
      .paginate({ numItems: SWEEP_PAGE_SIZE, cursor: args.cursor });
    const community = await ctx.db.get(integration.communityId);
    const userIds = page.page.map((membership: any) => membership.userId);
    // The owner may hold no membership row; they are covered all the same.
    if (community && args.cursor === null && !userIds.some((id: any) => normalizeIdValue(id) === normalizeIdValue(community.ownerId))) userIds.push(community.ownerId);
    for (const userId of userIds) {
      await syncCommunityAccessForUser(ctx, { communityId: integration.communityId, userId, nowMs, reason: "sweep", onlyIntegrationId: integration._id });
    }
    if (page.isDone) {
      await ctx.db.patch(integration._id, { sweepCursor: undefined });
      return { done: true, processed: userIds.length };
    }
    await ctx.db.patch(integration._id, { sweepCursor: page.continueCursor });
    await ctx.scheduler.runAfter(0, (internal as any).communityAccess.sweepIntegrationPageInternal, { integrationId: integration._id, cursor: page.continueCursor });
    return { done: false, processed: userIds.length };
  },
});

export const sweepCommunityAccessInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const nowMs = Date.now();
    const due = await ctx.db.query("communityAccessGrants")
      .withIndex("by_status_endsAt", (q) => q.eq("status", "active").gte("endsAt", 1).lte("endsAt", nowMs))
      .take(25);
    for (const grant of due) {
      await endGrantAndAccess(ctx, { communityId: grant.communityId, userId: grant.userId, grant, endedReason: "expired", nowMs });
    }
    const integrations = await ctx.db.query("communityAccessIntegrations").withIndex("by_status", (q) => q.eq("status", "active")).take(100);
    let started = 0;
    for (const integration of integrations) {
      // Start a full walk once a day per integration; a walk in progress keeps going.
      if (integration.sweepCursor || (integration.sweepStartedAt && nowMs - integration.sweepStartedAt < 24 * 60 * 60 * 1000)) continue;
      await scheduleSweep(ctx, integration._id, nowMs);
      started += 1;
    }
    return { grants_ended: due.length, sweeps_started: started };
  },
});

// ---------------------------------------------------------------------------
// The lookup API (HTTP, server API key). Fails closed: an unknown key is 401,
// an unknown member is "not found, not entitled".

export const lookupCommunityAccessInternal = internalMutation({
  args: {
    slug: v.string(),
    apiKey: v.string(),
    mode: v.union(v.literal("email"), v.literal("member"), v.literal("license"), v.literal("list"), v.literal("sign_in")),
    value: v.optional(v.string()),
    returnUrl: v.optional(v.string()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const unauthorized = { status: 401, body: { error: "unauthorized", access: { entitled: false } } };
    if (!communityAccessApiKeyLooksValid(args.apiKey)) return unauthorized;
    const hash = await sha256HexOf(args.apiKey);
    const row = await ctx.db.query("communityAccessIntegrations").withIndex("by_api_key_hash", (q) => q.eq("apiKeyHash", hash)).first();
    if (!row || row.status !== "active") return unauthorized;
    const community = await ctx.db.query("communities").withIndex("by_slug", (q) => q.eq("slug", String(args.slug).trim().toLowerCase())).first();
    if (!community || normalizeIdValue(community._id) !== normalizeIdValue(row.communityId)) return unauthorized;
    if (!row.lastLookupAt || nowMs - row.lastLookupAt > 60_000) await ctx.db.patch(row._id, { lastLookupAt: nowMs });

    const describe = async (userId: any) => {
      const computed = await computeCommunityMemberAccess(ctx, { community, userId, nowMs, integrations: [row] });
      const memberId = await ensureCommunityAccessMemberId(ctx, community._id, userId, nowMs);
      return {
        found: true,
        ...communityAccessMemberPayload({ community, memberId, user: computed.user, access: computed.access, integration: row, isTestMember: computed.isTestMember }),
        checked_at: new Date(nowMs).toISOString(),
      };
    };
    const notFound = { status: 200, body: { found: false, access: { entitled: false }, checked_at: new Date(nowMs).toISOString() } };

    if (args.mode === "list") {
      const page = await ctx.db.query("communityMemberships")
        .withIndex("by_community", (q) => q.eq("communityId", community._id))
        .paginate({ numItems: LOOKUP_LIST_PAGE_SIZE, cursor: args.cursor ?? null });
      const members = [];
      for (const membership of page.page) members.push(await describe(membership.userId));
      return { status: 200, body: { members, next_cursor: page.isDone ? null : page.continueCursor } };
    }
    if (args.mode === "email") {
      const email = normalizeEmailForVerification(args.value);
      if (!email) return notFound;
      const users = await ctx.db.query("users").withIndex("by_normalizedEmail", (q) => q.eq("normalizedEmail", email)).take(5);
      for (const user of users) {
        if (typeof user.emailVerifiedAt !== "number" || isTestMemberUser(user)) continue;
        const isOwner = normalizeIdValue(community.ownerId) === normalizeIdValue(user._id);
        const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId: community._id, userId: user._id });
        if (membership || isOwner) return { status: 200, body: await describe(user._id) };
      }
      return notFound;
    }
    if (args.mode === "member") {
      const mapping = await ctx.db.query("communityAccessMembers").withIndex("by_member_id", (q) => q.eq("memberId", String(args.value ?? ""))).first();
      if (!mapping || normalizeIdValue(mapping.communityId) !== normalizeIdValue(community._id)) return notFound;
      return { status: 200, body: await describe(mapping.userId) };
    }
    if (args.mode === "sign_in") {
      // One use, five minutes, this integration, the exact return address.
      const code = String(args.value ?? "").trim();
      if (!communityAccessSignInCodeLooksValid(code)) return notFound;
      const codeHash = await sha256HexOf(code);
      const codeRow = await ctx.db.query("communityAccessSignInCodes").withIndex("by_code_hash", (q) => q.eq("codeHash", codeHash)).first();
      if (!codeRow || codeRow.usedAt || codeRow.expiresAt <= nowMs) return notFound;
      if (normalizeIdValue(codeRow.integrationId) !== normalizeIdValue(row._id)) return notFound;
      if (String(args.returnUrl ?? "").trim() !== codeRow.returnUrl) return notFound;
      await ctx.db.patch(codeRow._id, { usedAt: nowMs });
      return { status: 200, body: await describe(codeRow.userId) };
    }
    const key = String(args.value ?? "").trim();
    if (!communityLicenseKeyLooksValid(key)) return notFound;
    const keyHash = await sha256HexOf(key);
    const keyRow = await ctx.db.query("communityMemberLicenseKeys").withIndex("by_key_hash", (q) => q.eq("keyHash", keyHash)).first();
    if (!keyRow || keyRow.status !== "active" || normalizeIdValue(keyRow.communityId) !== normalizeIdValue(community._id)) return notFound;
    await ctx.db.patch(keyRow._id, { lastCheckedAt: nowMs, lastCheckedByIntegrationId: row._id });
    return { status: 200, body: await describe(keyRow.userId) };
  },
});

// ---------------------------------------------------------------------------
// "Continue with Polynet": the member, signed in here, lets a connected
// service (a paid MCP server) learn who they are. Polynet hands their browser a
// one-time code for the service's own return address; the service redeems it
// with its API key (POST …/sign-in/redeem) and gets the usual lookup answer.

async function signInTarget(ctx: any, slug: string, returnUrl: string) {
  const community = await ctx.db.query("communities").withIndex("by_slug", (q: any) => q.eq("slug", String(slug ?? "").trim().toLowerCase())).first();
  if (!community) return null;
  const integrations = await listActiveCommunityAccessIntegrations(ctx, community._id);
  for (const integration of integrations) {
    const url = communityAccessReturnUrlFor(returnUrl, integration.webhookUrl);
    if (url) return { community, integration, returnUrl: url };
  }
  return { community, integration: null, returnUrl: null };
}

const signInArgs = { authSubject: v.optional(v.string()), slug: v.string(), returnUrl: v.string() };

export const getAccessSignInTarget = query({
  args: signInArgs,
  handler: async (ctx, args) => {
    const target = await signInTarget(ctx, args.slug, args.returnUrl);
    if (!target) return { found: false as const };
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null }).catch(() => null);
    let member: null | { email: string | null; is_member: boolean; entitled: boolean; status: string } = null;
    if (userId) {
      const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId: target.community._id, userId });
      const isOwner = normalizeIdValue(target.community.ownerId) === normalizeIdValue(userId);
      const computed = await computeCommunityMemberAccess(ctx, {
        community: target.community, userId, nowMs: Date.now(), integrations: target.integration ? [target.integration] : [],
      });
      const covered = target.integration
        ? communityIntegrationCoversAccess(computed.access, integrationInput(target.integration), { isTestMember: computed.isTestMember })
        : false;
      member = { email: computed.user?.email ?? null, is_member: Boolean(membership) || isOwner, entitled: covered, status: computed.access.status };
    }
    return {
      found: true as const,
      community: { id: String(target.community._id), slug: target.community.slug, name: target.community.name },
      service: target.integration ? { name: target.integration.name } : null,
      member,
    };
  },
});

export const createAccessSignInCode = mutation({
  args: signInArgs,
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    const nowMs = Date.now();
    const target = await signInTarget(ctx, args.slug, args.returnUrl);
    if (!target) throw new CommunityAccessError("community_not_found");
    if (!target.integration || !target.returnUrl) throw new CommunityAccessError("sign_in_not_set_up");
    const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId: target.community._id, userId });
    const isOwner = normalizeIdValue(target.community.ownerId) === normalizeIdValue(userId);
    if (!membership && !isOwner) throw new CommunityAccessError("sign_in_not_a_member");
    // A handful a minute is plenty for a person; more is someone looping.
    const recent = await ctx.db.query("communityAccessSignInCodes")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", userId).gt("createdAt", nowMs - 60_000)).take(6);
    if (recent.length >= 6) throw new CommunityAccessError("sign_in_rate_limited");
    const code = newCommunityAccessSignInCode();
    await ctx.db.insert("communityAccessSignInCodes", {
      communityId: target.community._id, integrationId: target.integration._id, userId,
      codeHash: await sha256HexOf(code), returnUrl: target.returnUrl, createdAt: nowMs,
      expiresAt: nowMs + COMMUNITY_ACCESS_SIGN_IN_CODE_TTL_MS,
    });
    await ensureCommunityAccessMemberId(ctx, target.community._id, userId, nowMs);
    return { code, return_url: target.returnUrl, expires_at: toIso(nowMs + COMMUNITY_ACCESS_SIGN_IN_CODE_TTL_MS) };
  },
});

// ---------------------------------------------------------------------------
// Entry points: the signed-in owner, admin or member in the web app, and the
// internal versions the owner's agent lane uses.

function signedIn<A extends { userId: unknown }>(validators: A) {
  const { userId: _userId, ...rest } = validators;
  return { authSubject: v.optional(v.string()), ...rest };
}

async function signedInArgs(ctx: any, args: { authSubject?: string } & Record<string, unknown>) {
  const { authSubject, ...rest } = args;
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: authSubject ?? null });
  return { ...rest, userId };
}

export const grantCommunityAccessInternal = internalMutation({ args: grantArgs, handler: grantAccess });
export const grantCommunityAccess = mutation({
  args: signedIn(grantArgs), handler: async (ctx, args) => grantAccess(ctx, { ...(await signedInArgs(ctx, args)), via: "web" }),
});
export const endCommunityAccess = mutation({
  args: signedIn(endAccessArgs), handler: async (ctx, args) => endAccess(ctx, { ...(await signedInArgs(ctx, args)), via: "web" }),
});
export const getClientAccess = query({
  args: signedIn(clientAccessArgs), handler: async (ctx, args) => readClientAccess(ctx, await signedInArgs(ctx, args)),
});
export const revokeClientLicenseKeyForOwner = mutation({
  args: signedIn(revokeKeyArgs), handler: async (ctx, args) => revokeClientLicenseKey(ctx, await signedInArgs(ctx, args)),
});
export const getMyCommunityAccess = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => readOwnAccess(ctx, await signedInArgs(ctx, args) as any),
});
export const createMyCommunityLicenseKey = mutation({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => createOwnLicenseKey(ctx, await signedInArgs(ctx, args) as any),
});
export const listAccessIntegrations = query({
  args: signedIn(managerArgs), handler: async (ctx, args) => listIntegrations(ctx, await signedInArgs(ctx, args)),
});
export const createAccessIntegration = mutation({
  args: signedIn(createIntegrationArgs), handler: async (ctx, args) => createIntegration(ctx, await signedInArgs(ctx, args)),
});
export const updateAccessIntegration = mutation({
  args: signedIn(updateIntegrationArgs), handler: async (ctx, args) => updateIntegration(ctx, await signedInArgs(ctx, args)),
});
export const rotateAccessIntegrationSecret = mutation({
  args: signedIn(rotateArgs), handler: async (ctx, args) => rotateIntegrationSecret(ctx, await signedInArgs(ctx, args)),
});
export const revokeAccessIntegration = mutation({
  args: signedIn(integrationArgs), handler: async (ctx, args) => revokeIntegration(ctx, await signedInArgs(ctx, args)),
});
export const sendAccessIntegrationTest = mutation({
  args: signedIn(integrationArgs), handler: async (ctx, args) => sendIntegrationTest(ctx, await signedInArgs(ctx, args)),
});
export const listAccessIntegrationEvents = query({
  args: signedIn(integrationArgs), handler: async (ctx, args) => listIntegrationEvents(ctx, await signedInArgs(ctx, args)),
});
export const retryAccessIntegrationEvent = mutation({
  args: signedIn(retryEventArgs), handler: async (ctx, args) => retryIntegrationEvent(ctx, await signedInArgs(ctx, args)),
});
