/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  communityAccessForIntegration,
  communityLicenseKeyLooksValid,
  deriveCommunityMemberAccess,
  describeCommunityAccess,
  newCommunityLicenseKey,
  normalizeCommunityAccessGrantEnd,
  normalizeCommunityAccessWebhookUrl,
  signCommunityAccessWebhook,
} from "../shared/communityAccess";

const modules = import.meta.glob([
  "./communityAccess.ts",
  "./communityAccessSync.ts",
  "./communityClients.ts",
  "./communityCommerce.ts",
  "./communityMemberWorkflows.ts",
  "./_generated/**/*.*s",
]);

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-25T09:00:00.000Z");

const baseInput = {
  nowMs: NOW,
  isOwner: false,
  communityActive: true,
  subscription: null,
  pricePoint: null,
  grant: null,
  integrations: [{ id: "int1", name: "Course MCP", pricePointIds: [], includeOwnerGrants: true }],
};
const monthly = { id: "pp1", name: "Monthly", billingPeriod: "month", amountBaseUnits: 13000, currency: "usd", currencyDecimals: 2 };

describe("the access rule", () => {
  test("a paid member renews, a cancelling one ends, and both reach the integration until then", () => {
    const paid = deriveCommunityMemberAccess({
      ...baseInput, pricePoint: monthly,
      membership: { active: true, accessSource: "paid_subscription" },
      subscription: { status: "active", cancelAtPeriodEnd: false, currentPeriodEndAt: NOW + 20 * DAY },
    });
    expect(paid).toMatchObject({ entitled: true, source: "paid_subscription", status: "active", renews_at: new Date(NOW + 20 * DAY).toISOString(), ends_at: null });
    expect(paid.can_use.map((use) => [use.label, use.included])).toEqual([["Community", true], ["Courses", true], ["Course MCP", true]]);
    expect(describeCommunityAccess(paid)).toBe("Paid · Monthly");

    const cancelling = deriveCommunityMemberAccess({
      ...baseInput, pricePoint: monthly,
      membership: { active: true, accessSource: "paid_subscription" },
      subscription: { status: "active", cancelAtPeriodEnd: true, currentPeriodEndAt: NOW + 5 * DAY },
    });
    expect(cancelling).toMatchObject({ entitled: true, status: "cancelling", renews_at: null, ends_at: new Date(NOW + 5 * DAY).toISOString() });
    expect(communityAccessForIntegration(cancelling, baseInput.integrations[0]!)).toMatchObject({ entitled: true, current_period_end: new Date(NOW + 5 * DAY).toISOString() });
  });

  test("an ended membership is never entitled, whatever the subscription row says", () => {
    const ended = deriveCommunityMemberAccess({
      ...baseInput, pricePoint: monthly,
      membership: { active: false, accessSource: "paid_subscription", revokedAt: NOW - DAY, revokedReason: "subscription_canceled" },
      subscription: { status: "active", cancelAtPeriodEnd: false, currentPeriodEndAt: NOW + 20 * DAY },
    });
    expect(ended).toMatchObject({ entitled: false, status: "ended", ended_reason: "subscription_canceled" });
    expect(ended.can_use.every((use) => !use.included)).toBe(true);
    const archived = deriveCommunityMemberAccess({ ...baseInput, communityActive: false, membership: { active: true, accessSource: "free_grant" } });
    expect(archived).toMatchObject({ entitled: false, ended_reason: "community_archived" });
  });

  test("owner grants carry their end date and stop being entitled at it", () => {
    const granted = deriveCommunityMemberAccess({
      ...baseInput, membership: { active: true, accessSource: "manual_grant" },
      grant: { endsAt: Date.parse("2027-02-22T23:59:59.999Z"), reason: "Trial set by hand", createdAt: NOW },
    });
    expect(granted).toMatchObject({ entitled: true, status: "granted", ends_at: "2027-02-22T23:59:59.999Z", plan: { kind: "grant", reason: "Trial set by hand" } });
    expect(describeCommunityAccess(granted)).toBe("Free access until 2027-02-22");
    const lapsed = deriveCommunityMemberAccess({
      ...baseInput, membership: { active: true, accessSource: "manual_grant" },
      grant: { endsAt: NOW - 1, reason: "Comp", createdAt: NOW - DAY },
    });
    expect(lapsed).toMatchObject({ entitled: false, status: "ended", ended_reason: "access_grant_ended" });
  });

  test("integrations see only what they cover: plans, grants, never free members or test members", () => {
    const free = deriveCommunityMemberAccess({ ...baseInput, membership: { active: true, accessSource: "free_grant" } });
    expect(free).toMatchObject({ entitled: true, status: "free" });
    expect(free.can_use[2]).toMatchObject({ included: false, why: "Free members aren't included" });

    const onlyAnnual = [{ id: "int1", name: "Course MCP", pricePointIds: ["pp2"], includeOwnerGrants: false }];
    const paidMonthly = deriveCommunityMemberAccess({
      ...baseInput, integrations: onlyAnnual, pricePoint: monthly,
      membership: { active: true, accessSource: "paid_subscription" }, subscription: { status: "active", cancelAtPeriodEnd: false },
    });
    expect(paidMonthly.can_use[2]).toMatchObject({ included: false, why: "Their plan isn't included" });
    const grantNotTaken = deriveCommunityMemberAccess({ ...baseInput, integrations: onlyAnnual, membership: { active: true, accessSource: "manual_grant" } });
    expect(grantNotTaken.can_use[2]).toMatchObject({ included: false, why: "Owner grants aren't included" });

    const tester = deriveCommunityMemberAccess({ ...baseInput, isTestMember: true, membership: { active: true, accessSource: "manual_grant" } });
    expect(tester.entitled).toBe(true);
    expect(tester.can_use[2]?.included).toBe(false);

    const owner = deriveCommunityMemberAccess({ ...baseInput, isOwner: true, membership: null });
    expect(owner).toMatchObject({ entitled: true, source: "owner", status: "owner" });
    expect(owner.can_use[2]?.included).toBe(true);
  });

  test("webhook URLs are public HTTPS, except loopback on a local Polynet", () => {
    expect(normalizeCommunityAccessWebhookUrl("https://api.chiefleverageofficers.com/webhooks/polynet")).toBe("https://api.chiefleverageofficers.com/webhooks/polynet");
    expect(() => normalizeCommunityAccessWebhookUrl("http://api.example.com/hook")).toThrow("access_webhook_url_https_required");
    expect(() => normalizeCommunityAccessWebhookUrl("https://10.0.0.5/hook")).toThrow("access_webhook_url_not_public");
    expect(() => normalizeCommunityAccessWebhookUrl("http://127.0.0.1:8787/webhooks/polynet")).toThrow("access_webhook_url_not_public");
    expect(normalizeCommunityAccessWebhookUrl("http://127.0.0.1:8787/webhooks/polynet", { allowLoopback: true })).toBe("http://127.0.0.1:8787/webhooks/polynet");
    expect(() => normalizeCommunityAccessWebhookUrl("http://192.168.1.4/hook", { allowLoopback: true })).toThrow("access_webhook_url_not_public");
    expect(() => normalizeCommunityAccessWebhookUrl("https://user:pw@example.com/hook")).toThrow("access_webhook_url_invalid");
  });

  test("grant end dates: a bare date ends at the end of that day, never in the past or beyond ten years", () => {
    expect(normalizeCommunityAccessGrantEnd("2027-02-22", NOW)).toBe(Date.parse("2027-02-22T23:59:59.999Z"));
    expect(normalizeCommunityAccessGrantEnd(null, NOW)).toBeNull();
    expect(() => normalizeCommunityAccessGrantEnd("2026-10-01", NOW)).toThrow("access_grant_end_in_past");
    expect(() => normalizeCommunityAccessGrantEnd("2027-02-30", NOW)).toThrow("access_grant_end_invalid");
    expect(() => normalizeCommunityAccessGrantEnd("2040-01-01", NOW)).toThrow("access_grant_end_too_far");
  });

  test("license keys carry the community and enough randomness", () => {
    const key = newCommunityLicenseKey("ai-employee-builders");
    expect(key).toMatch(/^pnk_aiemployeebuilde_[A-Za-z0-9]{32}$/);
    expect(communityLicenseKeyLooksValid(key)).toBe(true);
    expect(communityLicenseKeyLooksValid("pnk_club_short")).toBe(false);
    expect(newCommunityLicenseKey("club")).not.toBe(newCommunityLicenseKey("club"));
  });
});

type Delivery = { url: string; headers: Record<string, string>; body: any; raw: string };

async function fixture() {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const ids = await t.run(async (ctx) => {
    const user = (subject: string, handle: string, email?: string, verified = true) => ctx.db.insert("users", {
      authSubject: subject, displayName: handle, handle, normalizedHandle: handle, createdAt: nowMs, updatedAt: nowMs,
      ...(email ? { email, normalizedEmail: email.toLowerCase(), ...(verified ? { emailVerifiedAt: nowMs } : {}) } : {}),
    });
    const ownerId = await user("access-owner", "rashid", "owner@example.com");
    const samId = await user("access-sam", "sam", "sam@example.com");
    const kimId = await user("access-kim", "kim", "kim@example.com");
    const leeId = await user("access-lee", "lee", "lee@example.com");
    await user("access-unverified", "spoof", "spoof@example.com", false);
    const outsiderId = await user("access-outsider", "outsider", "outsider@example.com");
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "club", name: "Builders Club", visibility: "unlisted",
      inferenceFundingPolicy: "managed_required", entryPolicy: "paid_subscription", activeMemberCount: 2, createdAt: nowMs, updatedAt: nowMs,
    });
    const otherCommunityId = await ctx.db.insert("communities", {
      ownerId, slug: "the-2-hour-club", name: "The 2-Hour Club", visibility: "unlisted",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 0, createdAt: nowMs, updatedAt: nowMs,
    });
    const pricePointId = await ctx.db.insert("communityPricePoints", {
      communityId, billingPeriod: "month", name: "Monthly", amountBaseUnits: 13000, currency: "usd", currencyDecimals: 2,
      isCurrent: true, providerAccountId: "acct_test", createdAt: nowMs, updatedAt: nowMs,
    });
    const member = (userId: any) => ctx.db.insert("communityMemberships", {
      communityId, userId, role: "member", accessSource: "paid_subscription", pricePointId, active: true, activationSequence: 1,
      activatedAt: nowMs - DAY, createdAt: nowMs - DAY, updatedAt: nowMs - DAY,
    });
    const samMembership = await member(samId);
    const kimMembership = await member(kimId);
    const sub = (userId: any, membershipId: any, cancelAtPeriodEnd: boolean) => ctx.db.insert("communitySubscriptions", {
      communityId, userId, membershipId, pricePointId, source: "stripe", status: "active", cancelAtPeriodEnd,
      providerAccountId: "acct_test", providerSubscriptionId: `sub_${String(userId).slice(-4)}`,
      currentPeriodEndAt: nowMs + 20 * DAY, createdAt: nowMs, updatedAt: nowMs,
    });
    await sub(samId, samMembership, false);
    await sub(kimId, kimMembership, true);
    return { ownerId, samId, kimId, leeId, outsiderId, communityId, otherCommunityId, pricePointId, samMembership, kimMembership };
  });
  return {
    t, ...ids,
    asOwner: t.withIdentity({ subject: "access-owner" }),
    asSam: t.withIdentity({ subject: "access-sam" }),
    asLee: t.withIdentity({ subject: "access-lee" }),
    asOutsider: t.withIdentity({ subject: "access-outsider" }),
  };
}

describe("access integrations, grants and license keys", () => {
  let deliveries: Delivery[] = [];
  let respond: (url: string) => number = () => 200;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("ARX_DB_KEY", "access-test-key");
    deliveries = [];
    respond = () => 200;
    vi.stubGlobal("fetch", vi.fn(async (url: any, init: any) => {
      const raw = String(init?.body ?? "");
      deliveries.push({ url: String(url), headers: Object.fromEntries(Object.entries(init?.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)])), body: JSON.parse(raw), raw });
      return new Response("ok", { status: respond(String(url)) });
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  const settle = (f: { t: any }) => f.t.finishAllScheduledFunctions(vi.runAllTimers);
  const lastFor = (email: string) => [...deliveries].reverse().find((delivery) => delivery.body.member?.email === email)?.body;

  test("a new integration hears about everyone with access, signed, and the lookup answers by email, member id and list", async () => {
    const f = await fixture();
    const created = await f.asOwner.mutation(api.communityAccess.createAccessIntegration, {
      communityId: f.communityId, name: "Course MCP", webhookUrl: "https://mcp.example.com/webhooks/polynet",
    });
    expect(created.api_key).toMatch(/^pna_/);
    expect(created.signing_secret).toMatch(/^pnws_/);
    await settle(f);

    const sam = lastFor("sam@example.com");
    expect(sam).toMatchObject({
      type: "membership.access_changed", sequence: 1, reason: "sweep",
      community: { slug: "club" },
      member: { email: "sam@example.com", email_verified: true },
      access: { entitled: true, source: "paid_subscription", status: "active", plan_name: "Monthly" },
    });
    expect(sam.member.id).toMatch(/^pm_/);
    expect(sam.idempotency_key).toBe(`${sam.member.id}:1`);
    expect(lastFor("kim@example.com").access).toMatchObject({ entitled: true, status: "cancelling" });
    expect(lastFor("owner@example.com").access).toMatchObject({ entitled: true, source: "owner" });
    expect(lastFor("lee@example.com")).toBeUndefined();

    // The signature verifies with the secret shown once.
    const delivery = deliveries.find((candidate) => candidate.body.member?.email === "sam@example.com")!;
    const timestamp = Number(/t=(\d+)/.exec(delivery.headers["polynet-signature"]!)![1]);
    expect(delivery.headers["polynet-signature"]).toBe(await signCommunityAccessWebhook(created.signing_secret, timestamp, delivery.raw));
    expect(delivery.headers["polynet-event-id"]).toBe(sam.event_id);

    // Running the sweep again sends nothing new: nothing changed.
    const before = deliveries.length;
    await f.t.mutation(internal.communityAccess.sweepIntegrationPageInternal, { integrationId: created.integration.id as any, cursor: null });
    await settle(f);
    expect(deliveries.length).toBe(before);

    const byEmail = await f.t.mutation(internal.communityAccess.lookupCommunityAccessInternal, { slug: "club", apiKey: created.api_key, mode: "email", value: "SAM@example.com" });
    expect(byEmail).toMatchObject({ status: 200, body: { found: true, member: { id: sam.member.id }, access: { entitled: true } } });
    const byId = await f.t.mutation(internal.communityAccess.lookupCommunityAccessInternal, { slug: "club", apiKey: created.api_key, mode: "member", value: sam.member.id });
    expect(byId.body).toMatchObject({ found: true, member: { email: "sam@example.com" } });
    const list = await f.t.mutation(internal.communityAccess.lookupCommunityAccessInternal, { slug: "club", apiKey: created.api_key, mode: "list" });
    expect((list.body as any).members.map((member: any) => member.member.email).sort()).toEqual(["kim@example.com", "sam@example.com"]);

    // Fail closed: unknown people, unverified addresses, wrong keys, wrong community.
    const nobody = await f.t.mutation(internal.communityAccess.lookupCommunityAccessInternal, { slug: "club", apiKey: created.api_key, mode: "email", value: "spoof@example.com" });
    expect(nobody).toMatchObject({ status: 200, body: { found: false, access: { entitled: false } } });
    const badKey = await f.t.mutation(internal.communityAccess.lookupCommunityAccessInternal, { slug: "club", apiKey: "pna_" + "x".repeat(40), mode: "email", value: "sam@example.com" });
    expect(badKey.status).toBe(401);
    const otherCommunity = await f.t.mutation(internal.communityAccess.lookupCommunityAccessInternal, { slug: "the-2-hour-club", apiKey: created.api_key, mode: "list" });
    expect(otherCommunity.status).toBe(401);

    // Only owners and admins manage integrations.
    await expect(f.asOutsider.query(api.communityAccess.listAccessIntegrations, { communityId: f.communityId })).rejects.toThrow();
    const listed = await f.asOwner.query(api.communityAccess.listAccessIntegrations, { communityId: f.communityId });
    expect(listed.integrations).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(created.api_key);
    expect(JSON.stringify(listed)).not.toContain(created.signing_secret);
  });

  test("a cancelled subscription reaches the integration in the same write, with the next sequence", async () => {
    const f = await fixture();
    await f.asOwner.mutation(api.communityAccess.createAccessIntegration, {
      communityId: f.communityId, name: "Course MCP", webhookUrl: "https://mcp.example.com/webhooks/polynet",
    });
    await settle(f);
    await f.t.mutation(internal.communityCommerce.syncCommunitySubscriptionLifecycleInternal, {
      communityId: f.communityId, userId: f.samId, source: "stripe", status: "canceled",
      providerAccountId: "acct_test", providerSubscriptionId: `sub_${String(f.samId).slice(-4)}`,
    });
    await settle(f);
    const sam = lastFor("sam@example.com");
    expect(sam).toMatchObject({ sequence: 2, reason: "subscription_canceled", access: { entitled: false, status: "ended" } });
  });

  test("an owner grant gives dated access by verified email, can be extended, and ends on the date", async () => {
    const f = await fixture();
    await f.asOwner.mutation(api.communityAccess.createAccessIntegration, {
      communityId: f.communityId, name: "Course MCP", webhookUrl: "https://mcp.example.com/webhooks/polynet",
    });
    await settle(f);

    await expect(f.asOwner.mutation(api.communityAccess.grantCommunityAccess, {
      communityId: f.communityId, email: "spoof@example.com", endsAt: "2027-02-22", reason: "x",
    })).rejects.toThrow("access_grant_user_not_found");
    await expect(f.asOwner.mutation(api.communityAccess.grantCommunityAccess, {
      communityId: f.communityId, membershipId: String(f.samMembership), endsAt: "2027-02-22", reason: "Comp",
    })).rejects.toThrow("access_grant_member_paying");
    await expect(f.asOutsider.mutation(api.communityAccess.grantCommunityAccess, {
      communityId: f.communityId, email: "lee@example.com", endsAt: "2027-02-22", reason: "x",
    })).rejects.toThrow();

    const endsAt = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
    const granted = await f.asOwner.mutation(api.communityAccess.grantCommunityAccess, {
      communityId: f.communityId, email: "lee@example.com", endsAt, reason: "Trial, set by hand in Lemon Squeezy",
    });
    expect(granted.grant).toMatchObject({ status: "active", reason: "Trial, set by hand in Lemon Squeezy", ends_at: `${endsAt}T23:59:59.999Z` });
    await settle(f);
    expect(lastFor("lee@example.com")).toMatchObject({ sequence: 1, reason: "access_granted", access: { entitled: true, source: "manual_grant", status: "granted", ends_at: `${endsAt}T23:59:59.999Z` } });

    const leeAccess = await f.asOwner.query(api.communityAccess.getClientAccess, { communityId: f.communityId, membershipId: granted.membership_id });
    expect(leeAccess.access).toMatchObject({ entitled: true, status: "granted" });
    expect(leeAccess.integrations[0]).toMatchObject({ name: "Course MCP", entitled: true, last_event: { status: "delivered", entitled: true } });

    // Extending ends the old grant and starts a new one: the history keeps both.
    const later = new Date(Date.now() + 60 * DAY).toISOString().slice(0, 10);
    await f.asOwner.mutation(api.communityAccess.grantCommunityAccess, {
      communityId: f.communityId, membershipId: granted.membership_id, endsAt: later, reason: "Two more weeks",
    });
    await settle(f);
    const history = await f.asOwner.query(api.communityAccess.getClientAccess, { communityId: f.communityId, membershipId: granted.membership_id });
    expect(history.grants.map((grant: any) => [grant.status, grant.ended_reason])).toEqual([["active", null], ["ended", "replaced"]]);
    expect(lastFor("lee@example.com")).toMatchObject({ sequence: 2, reason: "access_grant_changed", access: { ends_at: `${later}T23:59:59.999Z` } });

    // The end date passes: the grant ends, the membership is revoked and the
    // integration hears. Fake timers fire the end job early (it then does
    // nothing), so this runs the 15-minute sweep that backs the job up.
    vi.setSystemTime(Date.parse(`${later}T23:59:59.999Z`) + 1000);
    expect(await f.t.mutation(internal.communityAccess.sweepCommunityAccessInternal, {})).toMatchObject({ grants_ended: 1 });
    await settle(f);
    const ended = await f.asOwner.query(api.communityAccess.getClientAccess, { communityId: f.communityId, membershipId: granted.membership_id });
    expect(ended.access).toMatchObject({ entitled: false, status: "ended", ended_reason: "access_grant_ended" });
    expect(ended.grants[0]).toMatchObject({ status: "ended", ended_reason: "expired" });
    expect(lastFor("lee@example.com")).toMatchObject({ sequence: 3, reason: "access_grant_expired", access: { entitled: false } });

    // The client's timeline tells the same story.
    const timeline = await f.asOwner.query(api.communityClients.getClientTimeline, { communityId: f.communityId, membershipId: granted.membership_id });
    const summaries = timeline.entries.map((entry: any) => entry.summary);
    expect(summaries).toContain(`Owner gave access until ${later}: Two more weeks`);
    expect(summaries).toContain("Access the owner gave ended on its date");
    expect(summaries).toContain("Course MCP was told they can't use it");
    expect(summaries).toContain("Course MCP was told they can use it");
  });

  test("ending a grant now revokes the membership; paid plans can't be ended here", async () => {
    const f = await fixture();
    const granted = await f.asOwner.mutation(api.communityAccess.grantCommunityAccess, {
      communityId: f.communityId, email: "lee@example.com", endsAt: null, reason: "Partner",
    });
    expect(granted.grant.ends_at).toBeNull();
    await f.asOwner.mutation(api.communityAccess.endCommunityAccess, { communityId: f.communityId, membershipId: granted.membership_id });
    const membership = await f.t.run((ctx) => ctx.db.get(granted.membership_id as any)) as any;
    expect(membership).toMatchObject({ active: false, revokedReason: "access_grant_ended" });
    await expect(f.asOwner.mutation(api.communityAccess.endCommunityAccess, { communityId: f.communityId, membershipId: String(f.samMembership) }))
      .rejects.toThrow("access_grant_not_found");
  });

  test("a member's license key is valid only while they have access; rotating kills the old one", async () => {
    const f = await fixture();
    const created = await f.asOwner.mutation(api.communityAccess.createAccessIntegration, {
      communityId: f.communityId, name: "Course MCP", webhookUrl: "https://mcp.example.com/webhooks/polynet",
    });
    await settle(f);
    const mine = await f.asSam.query(api.communityAccess.getMyCommunityAccess, { communityId: f.communityId });
    expect(mine).toMatchObject({ license_key_available: true, license_key: null, access: { entitled: true } });
    const first = await f.asSam.mutation(api.communityAccess.createMyCommunityLicenseKey, { communityId: f.communityId });
    expect(communityLicenseKeyLooksValid(first.key)).toBe(true);
    const verify = (key: string) => f.t.mutation(internal.communityAccess.lookupCommunityAccessInternal, { slug: "club", apiKey: created.api_key, mode: "license", value: key });
    expect((await verify(first.key)).body).toMatchObject({ found: true, member: { email: "sam@example.com" }, access: { entitled: true } });

    const second = await f.asSam.mutation(api.communityAccess.createMyCommunityLicenseKey, { communityId: f.communityId });
    expect(second.rotated).toBe(true);
    expect((await verify(first.key)).body).toMatchObject({ found: false, access: { entitled: false } });
    expect((await verify(second.key)).body).toMatchObject({ found: true });
    const after = await f.asSam.query(api.communityAccess.getMyCommunityAccess, { communityId: f.communityId });
    expect(after.license_key).toMatchObject({ last4: second.key.slice(-4) });
    expect(after.license_key?.last_checked_at).not.toBeNull();

    // Access ends: the same key now answers "not entitled".
    await f.t.mutation(internal.communityCommerce.syncCommunitySubscriptionLifecycleInternal, {
      communityId: f.communityId, userId: f.samId, source: "stripe", status: "ended",
      providerAccountId: "acct_test", providerSubscriptionId: `sub_${String(f.samId).slice(-4)}`,
    });
    expect((await verify(second.key)).body).toMatchObject({ found: true, access: { entitled: false, status: "ended" } });
    await expect(f.asSam.mutation(api.communityAccess.createMyCommunityLicenseKey, { communityId: f.communityId }))
      .rejects.toThrow("license_key_requires_access");

    // Someone without access can't make a key at all.
    await expect(f.asOutsider.mutation(api.communityAccess.createMyCommunityLicenseKey, { communityId: f.communityId }))
      .rejects.toThrow("license_key_requires_access");
  });

  test("Continue with Polynet: a member's one-time code reaches only the connected service, once, in time", async () => {
    const f = await fixture();
    const created = await f.asOwner.mutation(api.communityAccess.createAccessIntegration, {
      communityId: f.communityId, name: "Course MCP", webhookUrl: "https://mcp.example.com/webhooks/polynet",
    });
    await settle(f);
    const back = "https://mcp.example.com/oauth/polynet/callback";
    const target = await f.asSam.query(api.communityAccess.getAccessSignInTarget, { slug: "club", returnUrl: back });
    expect(target).toMatchObject({ found: true, service: { name: "Course MCP" }, member: { email: "sam@example.com", is_member: true, entitled: true } });
    // Another site can't receive a code.
    expect(await f.asSam.query(api.communityAccess.getAccessSignInTarget, { slug: "club", returnUrl: "https://evil.example.com/cb" }))
      .toMatchObject({ found: true, service: null });
    await expect(f.asSam.mutation(api.communityAccess.createAccessSignInCode, { slug: "club", returnUrl: "https://evil.example.com/cb" }))
      .rejects.toThrow("sign_in_not_set_up");
    await expect(f.asOutsider.mutation(api.communityAccess.createAccessSignInCode, { slug: "club", returnUrl: back }))
      .rejects.toThrow("sign_in_not_a_member");

    const redeem = (code: string, returnUrl = back, apiKey = created.api_key) =>
      f.t.mutation(internal.communityAccess.lookupCommunityAccessInternal, { slug: "club", apiKey, mode: "sign_in", value: code, returnUrl });
    const issued = await f.asSam.mutation(api.communityAccess.createAccessSignInCode, { slug: "club", returnUrl: back });
    expect(issued.code).toMatch(/^pnc_[A-Za-z0-9]{40}$/);
    expect((await redeem(issued.code, "https://mcp.example.com/other")).body).toMatchObject({ found: false });
    expect((await redeem(issued.code)).body).toMatchObject({ found: true, member: { email: "sam@example.com" }, access: { entitled: true } });
    // Once only.
    expect((await redeem(issued.code)).body).toMatchObject({ found: false, access: { entitled: false } });

    // Five minutes, then it's gone.
    const late = await f.asSam.mutation(api.communityAccess.createAccessSignInCode, { slug: "club", returnUrl: back });
    vi.advanceTimersByTime(5 * 60_000 + 1);
    expect((await redeem(late.code)).body).toMatchObject({ found: false });
    // Someone else's API key can't redeem it.
    const fresh = await f.asSam.mutation(api.communityAccess.createAccessSignInCode, { slug: "club", returnUrl: back });
    expect((await redeem(fresh.code, back, "pna_" + "x".repeat(40))).status).toBe(401);
  });

  test("a failing webhook retries, then waits for a person after 72 hours", async () => {
    const f = await fixture();
    respond = () => 503;
    const created = await f.asOwner.mutation(api.communityAccess.createAccessIntegration, {
      communityId: f.communityId, name: "Course MCP", webhookUrl: "https://mcp.example.com/webhooks/polynet",
    });
    await settle(f);
    const events = await f.asOwner.query(api.communityAccess.listAccessIntegrationEvents, { communityId: f.communityId, integrationId: created.integration.id });
    expect(events.events.length).toBeGreaterThan(0);
    expect(events.events.every((event: any) => event.status === "needs_attention" && event.last_error_code === "http_503")).toBe(true);
    expect(events.events[0].attempt_count).toBeGreaterThan(3);

    respond = () => 200;
    const target = events.events[0];
    await f.asOwner.mutation(api.communityAccess.retryAccessIntegrationEvent, { communityId: f.communityId, integrationId: created.integration.id, eventId: target.event_id });
    await settle(f);
    const retried = await f.asOwner.query(api.communityAccess.listAccessIntegrationEvents, { communityId: f.communityId, integrationId: created.integration.id });
    expect(retried.events.find((event: any) => event.event_id === target.event_id).status).toBe("delivered");
  });

  test("the Clients list shows each client's access", async () => {
    const f = await fixture();
    await f.asOwner.mutation(api.communityAccess.createAccessIntegration, {
      communityId: f.communityId, name: "Course MCP", webhookUrl: "https://mcp.example.com/webhooks/polynet",
    });
    await settle(f);
    const list = await f.asOwner.query(api.communityClients.listClientsForOwner, { communityId: f.communityId });
    const byName = Object.fromEntries(list.clients.map((client: any) => [client.name, client]));
    expect(byName.sam.access).toMatchObject({ entitled: true, status: "active", license_key: null });
    expect(byName.sam.access.can_use.map((use: any) => use.label)).toEqual(["Community", "Courses", "Course MCP"]);
    expect(byName.kim.access).toMatchObject({ status: "cancelling" });
  });
});
