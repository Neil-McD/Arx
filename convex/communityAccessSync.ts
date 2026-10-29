import { internal } from "./_generated/api";
import {
  communityMembershipRowIsActive,
  getUniqueCommunityMembershipByPair,
  normalizeCommunitySubscriptionStatus,
  normalizeIdValue,
} from "./communityCore";
import { communityIsActive } from "../shared/communityLifecycle";
import { syncCommunityMemberOffers } from "./communityOfferAccessCore";
import {
  communityAccessForIntegration,
  deriveCommunityMemberAccess,
  newCommunityAccessEventId,
  newCommunityAccessMemberId,
  type CommunityAccessIntegrationInput,
  type CommunityMemberAccess,
} from "../shared/communityAccess";

// Reads one member's access from the records that own it, and tells every
// access integration of the community when something it can see changed.
// Kept apart from the grant and key code so the membership lifecycle can call
// it without an import cycle.

const TEST_SUBJECT_PREFIX = "polynet-test:";

export async function listActiveCommunityAccessIntegrations(ctx: any, communityId: any) {
  const rows = await ctx.db.query("communityAccessIntegrations")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .take(50);
  return rows.filter((row: any) => row.status === "active");
}

export function integrationInput(row: any): CommunityAccessIntegrationInput {
  return {
    id: String(row._id),
    name: row.name,
    pricePointIds: (row.pricePointIds ?? []).map((id: any) => String(id)),
    includeOwnerGrants: row.includeOwnerGrants !== false,
  };
}

export async function readActiveCommunityAccessGrant(ctx: any, communityId: any, userId: any) {
  return await ctx.db.query("communityAccessGrants")
    .withIndex("by_community_user_status", (q: any) => q.eq("communityId", communityId).eq("userId", userId).eq("status", "active"))
    .first();
}

// The subscription that decides access: one that grants it wins, then the newest.
export async function readDecidingCommunitySubscription(ctx: any, membershipId: any) {
  const rows = await ctx.db.query("communitySubscriptions")
    .withIndex("by_membership", (q: any) => q.eq("membershipId", membershipId))
    .take(20);
  const grants = (row: any) => {
    const status = normalizeCommunitySubscriptionStatus(row.status);
    return status === "active" || status === "past_due" || status === "cancel_at_period_end";
  };
  return rows.slice().sort((a: any, b: any) => {
    if (grants(a) !== grants(b)) return grants(a) ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  })[0] ?? null;
}

export function isTestMemberUser(user: any): boolean {
  return String(user?.authSubject ?? "").startsWith(TEST_SUBJECT_PREFIX);
}

export type ComputedCommunityAccess = {
  access: CommunityMemberAccess;
  membership: any | null;
  user: any | null;
  grant: any | null;
  isTestMember: boolean;
  integrations: any[];
};

export async function computeCommunityMemberAccess(ctx: any, args: {
  community: any;
  userId: any;
  nowMs: number;
  membership?: any | null;
  integrations?: any[];
}): Promise<ComputedCommunityAccess> {
  const { community, userId, nowMs } = args;
  const membership = args.membership !== undefined
    ? args.membership
    : await getUniqueCommunityMembershipByPair({ ctx, communityId: community._id, userId });
  const integrations = args.integrations ?? await listActiveCommunityAccessIntegrations(ctx, community._id);
  const [user, grant, subscription] = await Promise.all([
    ctx.db.get(userId),
    readActiveCommunityAccessGrant(ctx, community._id, userId),
    membership ? readDecidingCommunitySubscription(ctx, membership._id) : Promise.resolve(null),
  ]);
  const pricePointId = subscription?.pricePointId ?? membership?.pricePointId ?? null;
  const pricePoint = pricePointId ? await ctx.db.get(pricePointId) : null;
  const isTestMember = isTestMemberUser(user);
  const access = deriveCommunityMemberAccess({
    nowMs,
    isOwner: normalizeIdValue(community.ownerId) === normalizeIdValue(userId),
    communityActive: communityIsActive(community),
    membership: membership ? {
      active: communityMembershipRowIsActive(membership),
      accessSource: membership.accessSource ?? null,
      activatedAt: membership.activatedAt ?? membership.createdAt ?? null,
      revokedAt: membership.revokedAt ?? null,
      revokedReason: membership.revokedReason ?? null,
    } : null,
    subscription: subscription ? {
      status: String(subscription.status),
      cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd),
      currentPeriodEndAt: subscription.currentPeriodEndAt ?? null,
    } : null,
    pricePoint: pricePoint ? {
      id: String(pricePoint._id),
      name: pricePoint.name,
      billingPeriod: pricePoint.billingPeriod,
      amountBaseUnits: pricePoint.amountBaseUnits,
      currency: pricePoint.currency,
      currencyDecimals: pricePoint.currencyDecimals,
    } : null,
    grant: grant ? { endsAt: grant.endsAt ?? null, reason: grant.reason, createdAt: grant.createdAt } : null,
    isTestMember,
    integrations: integrations.map(integrationInput),
  });
  return { access, membership, user, grant, isTestMember, integrations };
}

export async function readCommunityAccessMemberId(ctx: any, communityId: any, userId: any): Promise<string | null> {
  const row = await ctx.db.query("communityAccessMembers")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId))
    .first();
  return row?.memberId ?? null;
}

export async function ensureCommunityAccessMemberId(ctx: any, communityId: any, userId: any, nowMs: number): Promise<string> {
  const existing = await readCommunityAccessMemberId(ctx, communityId, userId);
  if (existing) return existing;
  const memberId = newCommunityAccessMemberId();
  await ctx.db.insert("communityAccessMembers", { communityId, userId, memberId, createdAt: nowMs });
  return memberId;
}

export function verifiedEmailOf(user: any): string | null {
  const email = String(user?.email ?? "").trim().toLowerCase();
  return email && typeof user?.emailVerifiedAt === "number" ? email : null;
}

/** The body an integration receives for one member: the same shape for the webhook and the lookup. */
export function communityAccessMemberPayload(args: {
  community: any;
  memberId: string;
  user: any;
  access: CommunityMemberAccess;
  integration: any;
  isTestMember: boolean;
}) {
  const email = verifiedEmailOf(args.user);
  return {
    community: { slug: args.community.slug, name: args.community.name },
    member: { id: args.memberId, email, email_verified: Boolean(email) },
    access: communityAccessForIntegration(args.access, integrationInput(args.integration), { isTestMember: args.isTestMember }),
  };
}

export async function enqueueCommunityAccessEvent(ctx: any, args: {
  communityId: any;
  integrationId: any;
  userId?: any;
  memberId?: string;
  type: "membership.access_changed" | "integration.test";
  payload: Record<string, unknown>;
  entitled?: boolean;
  nowMs: number;
}) {
  const eventId = String(args.payload.event_id);
  const rowId = await ctx.db.insert("communityAccessEvents", {
    communityId: args.communityId,
    integrationId: args.integrationId,
    ...(args.userId ? { userId: args.userId } : {}),
    ...(args.memberId ? { memberId: args.memberId } : {}),
    eventId,
    type: args.type,
    payload: args.payload,
    ...(args.entitled === undefined ? {} : { entitled: args.entitled }),
    status: "pending",
    attemptCount: 0,
    nextAttemptAt: args.nowMs,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  await ctx.scheduler.runAfter(0, (internal as any).communityAccess.deliverAccessEventInternal, { eventRowId: rowId });
  return rowId;
}

/**
 * Tells each access integration of the community about this member, once per
 * change it can see. A member it was never told about and who is not entitled
 * produces nothing. Called in the same transaction as every write that can
 * change access; the periodic sweep catches anything else.
 */
export async function syncCommunityAccessForUser(ctx: any, args: {
  communityId: any;
  userId: any;
  nowMs: number;
  reason: string;
  onlyIntegrationId?: any;
}): Promise<{ enqueued: number }> {
  // What the member's offer unlocks moves with the same writes (the periodic sweep is integration-only).
  if (!args.onlyIntegrationId) await syncCommunityMemberOffers(ctx, { communityId: args.communityId, userId: args.userId, nowMs: args.nowMs });
  let integrations = await listActiveCommunityAccessIntegrations(ctx, args.communityId);
  if (args.onlyIntegrationId) {
    integrations = integrations.filter((row: any) => normalizeIdValue(row._id) === normalizeIdValue(args.onlyIntegrationId));
  }
  if (!integrations.length) return { enqueued: 0 };
  const community = await ctx.db.get(args.communityId);
  if (!community) return { enqueued: 0 };
  const computed = await computeCommunityMemberAccess(ctx, { community, userId: args.userId, nowMs: args.nowMs, integrations });
  let memberId: string | null = null;
  let enqueued = 0;
  for (const integration of integrations) {
    const state = await ctx.db.query("communityAccessDeliveryStates")
      .withIndex("by_integration_user", (q: any) => q.eq("integrationId", integration._id).eq("userId", args.userId))
      .first();
    memberId ??= state ? await readCommunityAccessMemberId(ctx, args.communityId, args.userId) : null;
    memberId ??= await ensureCommunityAccessMemberId(ctx, args.communityId, args.userId, args.nowMs);
    const body = communityAccessMemberPayload({
      community, memberId, user: computed.user, access: computed.access, integration, isTestMember: computed.isTestMember,
    });
    if (!state && !body.access.entitled) continue;
    const fingerprint = JSON.stringify({ member: body.member, access: body.access });
    if (state?.fingerprint === fingerprint) continue;
    const sequence = (state?.sequence ?? 0) + 1;
    if (state) await ctx.db.patch(state._id, { fingerprint, sequence, updatedAt: args.nowMs });
    else await ctx.db.insert("communityAccessDeliveryStates", {
      integrationId: integration._id, communityId: args.communityId, userId: args.userId, fingerprint, sequence, updatedAt: args.nowMs,
    });
    const eventId = newCommunityAccessEventId();
    await enqueueCommunityAccessEvent(ctx, {
      communityId: args.communityId,
      integrationId: integration._id,
      userId: args.userId,
      memberId,
      type: "membership.access_changed",
      entitled: body.access.entitled,
      nowMs: args.nowMs,
      payload: {
        type: "membership.access_changed",
        event_id: eventId,
        // A later event for the same member always carries a higher sequence;
        // receivers ignore one at or below the last they applied.
        idempotency_key: `${memberId}:${sequence}`,
        sequence,
        reason: args.reason,
        ...body,
        occurred_at: new Date(args.nowMs).toISOString(),
      },
    });
    enqueued += 1;
  }
  return { enqueued };
}

// ---------------------------------------------------------------------------
// Projections shared by the owner and member reads and the Clients list

const toIso = (ms: number | null | undefined) => (typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null);

export function projectCommunityAccessGrant(row: any) {
  return {
    id: String(row._id),
    status: row.status,
    reason: row.reason,
    ends_at: toIso(row.endsAt),
    granted_at: toIso(row.createdAt),
    granted_by_user_id: String(row.grantedByUserId),
    granted_via: row.grantedVia,
    ended_at: toIso(row.endedAt),
    ended_reason: row.endedReason ?? null,
    offer_key: row.offerKey ?? null,
  };
}

export async function readActiveCommunityLicenseKey(ctx: any, communityId: any, userId: any) {
  return await ctx.db.query("communityMemberLicenseKeys")
    .withIndex("by_community_user_status", (q: any) => q.eq("communityId", communityId).eq("userId", userId).eq("status", "active"))
    .first();
}

export function projectCommunityLicenseKey(row: any) {
  return row ? {
    last4: row.last4,
    created_at: toIso(row.createdAt),
    last_checked_at: toIso(row.lastCheckedAt),
  } : null;
}

/** One client's access for the Clients list: the access rule plus their key. */
export async function readClientAccessForList(ctx: any, args: { community: any; membership: any; integrations: any[]; nowMs: number }) {
  const { access, grant } = await computeCommunityMemberAccess(ctx, {
    community: args.community, userId: args.membership.userId, nowMs: args.nowMs, membership: args.membership, integrations: args.integrations,
  });
  const key = await readActiveCommunityLicenseKey(ctx, args.community._id, args.membership.userId);
  return { ...access, grant: grant ? projectCommunityAccessGrant(grant) : null, license_key: projectCommunityLicenseKey(key) };
}

// ---------------------------------------------------------------------------
// Access history for the Clients timeline: what the owner gave and ended, the
// member's license keys, and every time a connected service was told.

type AccessTimelineEntry = { at: number; type: string; summary: string; actor?: string };

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function readCommunityAccessTimelineEntries(ctx: any, args: { communityId: any; membership: any; limit: number }): Promise<AccessTimelineEntry[]> {
  const { communityId, membership, limit } = args;
  const [grants, keys, events] = await Promise.all([
    ctx.db.query("communityAccessGrants").withIndex("by_membership_createdAt", (q: any) => q.eq("membershipId", membership._id)).order("desc").take(limit),
    ctx.db.query("communityMemberLicenseKeys")
      .withIndex("by_community_user_status", (q: any) => q.eq("communityId", communityId).eq("userId", membership.userId)).take(limit),
    ctx.db.query("communityAccessEvents")
      .withIndex("by_community_user_createdAt", (q: any) => q.eq("communityId", communityId).eq("userId", membership.userId))
      .order("desc").take(limit),
  ]);
  const entries: AccessTimelineEntry[] = [];
  for (const grant of grants as any[]) {
    const who = grant.grantedVia === "agent" ? "Agent" : "Owner";
    entries.push({ at: grant.createdAt, type: "access_granted", actor: grant.grantedVia,
      summary: `${who} gave access ${typeof grant.endsAt === "number" ? `until ${dayOf(grant.endsAt)}` : "with no end date"}: ${grant.reason}` });
    // A replaced grant is covered by the grant that replaced it.
    if (grant.status === "ended" && grant.endedReason !== "replaced") {
      entries.push({ at: grant.endedAt ?? grant.updatedAt, type: "access_grant_ended",
        summary: grant.endedReason === "expired" ? "Access the owner gave ended on its date" : "Owner ended the access they gave" });
    }
  }
  for (const key of keys as any[]) {
    entries.push({ at: key.createdAt, type: "license_key_created", summary: `Made a license key ending ${key.last4}` });
    if (key.status === "revoked") {
      entries.push({ at: key.revokedAt ?? key.createdAt, type: "license_key_revoked",
        summary: `${key.revokedByUserId ? "Owner revoked" : "Revoked"} the license key ending ${key.last4}` });
    }
  }
  const names = new Map<string, string>();
  for (const event of events as any[]) {
    if (event.type !== "membership.access_changed") continue;
    const id = String(event.integrationId);
    if (!names.has(id)) names.set(id, (await ctx.db.get(event.integrationId))?.name ?? "A connected service");
    const name = names.get(id);
    if (event.status === "delivered") {
      entries.push({ at: event.deliveredAt ?? event.updatedAt, type: "access_delivered",
        summary: `${name} was told they ${event.entitled ? "can" : "can't"} use it` });
    } else if (event.status === "needs_attention") {
      entries.push({ at: event.updatedAt, type: "access_delivery_failed",
        summary: `Couldn't tell ${name} that they ${event.entitled ? "can" : "can't"} use it (${String(event.lastErrorCode ?? "no answer").replace(/_/g, " ")})` });
    }
  }
  return entries;
}
