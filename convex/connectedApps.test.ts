import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { signStandardWebhook, webhookUrlIsAllowed } from "./connectedApps";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = Date.now();

afterEach(() => { vi.unstubAllGlobals(); });

async function setup(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const user = (handle: string, verified = true) => ctx.db.insert("users", {
      authSubject: `${handle}-subject`, displayName: handle, handle, normalizedHandle: handle,
      email: `${handle}@example.com`, normalizedEmail: `${handle}@example.com`, ...(verified ? { emailVerifiedAt: NOW } : {}),
      createdAt: NOW, updatedAt: NOW,
    });
    const ownerId = await user("owner");
    const buyerId = await user("buyer");
    await user("unverified", false);
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "de-pilot", name: "Distribution Engineer", lifecycleStatus: "active", lifecycleGeneration: 0, visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 1, createdAt: NOW, updatedAt: NOW,
    } as any);
    await ctx.db.insert("communityTiers", { communityId, key: "member", name: "Connect", rank: 0, grants: ["de:connect"], createdAt: NOW, updatedAt: NOW });
    const membershipId = await ctx.db.insert("communityMemberships", {
      communityId, userId: buyerId, role: "member", accessSource: "free_grant", state: "active", activationSequence: 1, activatedAt: NOW, createdAt: NOW, updatedAt: NOW,
    } as any);
    return { ownerId, buyerId, communityId, membershipId };
  });
}

const access = (t: ReturnType<typeof convexTest>, secret: string | null, email: string) => t.fetch(`/apps/v1/access?email=${encodeURIComponent(email)}`, {
  method: "GET", headers: secret ? { authorization: `Bearer ${secret}` } : {},
});

test("a builder registers their app; it reads a member's tier and grants by verified email, and nothing else", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  const asOwner = t.withIdentity({ subject: "owner-subject" });
  // Only builders register; webhooks only to a public https address.
  await expect(t.withIdentity({ subject: "buyer-subject" }).mutation(api.connectedApps.registerConnectedApp, { communityId: ids.communityId, name: "DE" })).rejects.toThrow();
  await expect(asOwner.mutation(api.connectedApps.registerConnectedApp, { communityId: ids.communityId, name: "DE", webhookUrl: "http://de.example.com/hook" }))
    .rejects.toThrow(/webhook_url_invalid/);
  const app = await asOwner.mutation(api.connectedApps.registerConnectedApp, { communityId: ids.communityId, name: "Distribution Engineer", webhookUrl: "https://de.example.com/polynet" });
  expect(app.secret).toMatch(/^psk_[a-f0-9]{48}$/);
  expect(app.webhook_signing_secret).toMatch(/^whsec_/);
  // The secret is shown once: never stored or listed in the clear.
  const stored = await t.run((ctx) => ctx.db.query("connectedApps").first());
  expect(JSON.stringify(stored)).not.toContain(app.secret);
  const listed = await asOwner.query(api.connectedApps.listConnectedApps, { communityId: ids.communityId });
  expect(listed.apps).toMatchObject([{ app_id: app.app_id, name: "Distribution Engineer", webhook_url: "https://de.example.com/polynet", secret_hint: app.secret.slice(-4) }]);
  expect(JSON.stringify(listed)).not.toContain(app.secret);

  // The access check: a member's tier and grants...
  const ok = await access(t, app.secret, "Buyer@Example.com");
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({ allowed: true, tier: { key: "member", name: "Connect" }, grants: ["community", "de:connect"] });
  // ...and the same plain "no" for a non-member, an unknown email and an unverified one.
  for (const email of ["owner@example.com", "nobody@example.com", "unverified@example.com"]) {
    expect(await (await access(t, app.secret, email)).json()).toEqual({ allowed: false, tier: null, grants: [] });
  }
  // No secret, a wrong one, or no email: refused.
  expect((await access(t, null, "buyer@example.com")).status).toBe(401);
  expect((await access(t, `psk_${"0".repeat(48)}`, "buyer@example.com")).status).toBe(401);
  expect((await access(t, app.secret, "")).status).toBe(400);

  // Rotating: the old secret stops at once; disconnecting stops the new one.
  const rotated = await asOwner.mutation(api.connectedApps.rotateConnectedAppSecret, { communityId: ids.communityId, appId: app.app_id });
  expect((await access(t, app.secret, "buyer@example.com")).status).toBe(401);
  expect((await access(t, rotated.secret, "buyer@example.com")).status).toBe(200);
  await asOwner.mutation(api.connectedApps.revokeConnectedApp, { communityId: ids.communityId, appId: app.app_id });
  expect((await access(t, rotated.secret, "buyer@example.com")).status).toBe(401);
});

test("access changes send the app a signed, thin access.changed, retried until it's taken", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  const asOwner = t.withIdentity({ subject: "owner-subject" });
  const app = await asOwner.mutation(api.connectedApps.registerConnectedApp, { communityId: ids.communityId, name: "DE", webhookUrl: "https://de.example.com/polynet" });
  // The member leaves: one delivery for the app, with only the email in it.
  await t.withIdentity({ subject: "buyer-subject" }).mutation(api.communityAdmin.leaveCommunity, { communityId: ids.communityId });
  const deliveries = await t.run((ctx) => ctx.db.query("connectedAppDeliveries").collect());
  expect(deliveries).toMatchObject([{ appId: app.app_id, type: "access.changed", email: "buyer@example.com", status: "pending", attempts: 0 }]);
  // The first attempt fails (the app is down): kept, retried later.
  const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  let status = 503;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
    calls.push({ url, headers: init.headers, body: init.body });
    return new Response("", { status });
  }));
  await t.action(internal.connectedApps.deliverConnectedAppWebhookInternal, { deliveryId: deliveries[0]._id });
  expect(await t.run((ctx) => ctx.db.get(deliveries[0]._id))).toMatchObject({ status: "pending", lastError: "http_503" });
  status = 200;
  await t.action(internal.connectedApps.deliverConnectedAppWebhookInternal, { deliveryId: deliveries[0]._id });
  const delivered: any = await t.run((ctx) => ctx.db.get(deliveries[0]._id));
  expect(delivered.status).toBe("delivered");
  expect(delivered.attempts).toBeGreaterThanOrEqual(2);
  // Standard Webhooks: same id on every attempt, a signature the app can check.
  expect(calls[0].url).toBe("https://de.example.com/polynet");
  expect(new Set(calls.map((call) => call.headers["webhook-id"])).size).toBe(1);
  const last = calls[calls.length - 1];
  expect(JSON.parse(last.body)).toMatchObject({ type: "access.changed", data: { email: "buyer@example.com" } });
  expect(last.headers["webhook-signature"]).toBe(await signStandardWebhook(app.webhook_signing_secret, last.headers["webhook-id"], Number(last.headers["webhook-timestamp"]), last.body));
  // A delivered event isn't picked up again (any retry already queued skips it).
  expect(await t.query(internal.connectedApps.getDeliveryInternal, { deliveryId: deliveries[0]._id })).toBeNull();
  expect(await t.action(internal.connectedApps.deliverConnectedAppWebhookInternal, { deliveryId: deliveries[0]._id })).toEqual({ skipped: true });
});

test("webhooks only go to a public https address", () => {
  for (const ok of ["https://de.example.com/polynet", "https://api.distribution.engineer/hooks/polynet"]) expect(webhookUrlIsAllowed(ok)).toBe(true);
  for (const bad of ["http://de.example.com", "https://localhost/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://[::1]/x",
    "https://box.local/x", "https://user:pw@de.example.com", "https://intranet/x", "not a url"]) expect(webhookUrlIsAllowed(bad)).toBe(false);
});
