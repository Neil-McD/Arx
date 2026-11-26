import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { buildLandingCheckoutReturnQuery } from "./communityLanding";
import { pkceS256Challenge, redirectUrlIsAllowed, signStandardWebhook, webhookUrlIsAllowed } from "./connectedApps";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = Date.now();

afterEach(() => { vi.unstubAllGlobals(); });

async function setup(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const user = async (handle: string, verified = true, completedSetup = true) => {
      const uid = await ctx.db.insert("users", {
        authSubject: `${handle}-subject`, displayName: handle, handle, normalizedHandle: handle,
        email: `${handle}@example.com`, normalizedEmail: `${handle}@example.com`, ...(verified ? { emailVerifiedAt: NOW } : {}),
        createdAt: NOW, updatedAt: NOW,
      });
      if (completedSetup) {
        await ctx.db.insert("userProfileDetails", {
          userId: uid,
          displayName: handle,
          createdAt: NOW,
          updatedAt: NOW,
        } as any);
        for (const doc of PLATFORM_LEGAL_DOCUMENTS) {
          await ctx.db.insert("legalAcceptances", {
            userId: uid,
            documentKey: doc.key,
            documentVersion: doc.version,
            acceptedAt: NOW,
            source: "account_setup",
            createdAt: NOW,
          } as any);
        }
      }
      return uid;
    };
    const ownerId = await user("owner");
    const buyerId = await user("buyer");
    await user("unverified", false);
    await user("incomplete", true, false);
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
    "https://box.local/x", "https://user:pw@de.example.com", "https://intranet/x", "not a url",
    "https://localhost./hook", "https://box.internal./hook", "https://de.example.com:8443/x", "https://2130706433/x", "https://0x7f000001/x"]) expect(webhookUrlIsAllowed(bad)).toBe(false);
});

test("members see the app's name and address to open it, and nothing else; outsiders see nothing", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  const asOwner = t.withIdentity({ subject: "owner-subject" });
  await expect(asOwner.mutation(api.connectedApps.registerConnectedApp, { communityId: ids.communityId, name: "DE", appUrl: "http://localhost:3000" }))
    .rejects.toThrow(/connected_app_url_invalid/);
  const app = await asOwner.mutation(api.connectedApps.registerConnectedApp, { communityId: ids.communityId, name: "Distribution Engineer", appUrl: "https://de.example.com" });
  // An app without an address is connected but not linked.
  await asOwner.mutation(api.connectedApps.registerConnectedApp, { communityId: ids.communityId, name: "Hidden" });
  const asBuyer = t.withIdentity({ subject: "buyer-subject" });
  const links = await asBuyer.query(api.connectedApps.listCommunityAppLinks, { communityId: ids.communityId });
  expect(links).toEqual({ apps: [{ name: "Distribution Engineer", url: "https://de.example.com" }] });
  expect(JSON.stringify(links)).not.toContain(app.app_id);
  // Not a member: refused.
  await expect(t.withIdentity({ subject: "unverified-subject" }).query(api.connectedApps.listCommunityAppLinks, { communityId: ids.communityId })).rejects.toThrow();
  // The builder changes or clears the address.
  await asOwner.mutation(api.connectedApps.updateConnectedApp, { communityId: ids.communityId, appId: app.app_id, appUrl: "https://app.de.example.com" });
  expect((await asBuyer.query(api.connectedApps.listCommunityAppLinks, { communityId: ids.communityId })).apps).toEqual([{ name: "Distribution Engineer", url: "https://app.de.example.com" }]);
  await asOwner.mutation(api.connectedApps.updateConnectedApp, { communityId: ids.communityId, appId: app.app_id, appUrl: "" });
  expect((await asBuyer.query(api.connectedApps.listCommunityAppLinks, { communityId: ids.communityId })).apps).toEqual([]);
});

test("OAuth redirect URL validation allows public https and localhost dev callbacks, rejecting fragments and private hosts", () => {
  for (const ok of [
    "https://de.example.com/api/auth/polynet/callback",
    "http://localhost:3000/api/auth/polynet/callback",
    "http://127.0.0.1:5173/callback",
  ]) {
    expect(redirectUrlIsAllowed(ok), ok).toBe(true);
  }
  for (const bad of [
    "http://de.example.com/callback",
    "https://de.example.com/callback#frag",
    "https://de.example.com/callback#",
    "https://de.example.com/\tcallback",
    "http://localhost./callback",
    "http://127.0.0.1./callback",
    "https://de.example.com/callback?code=1",
    "https://de.example.com/callback?state=1",
    "https://de.example.com/callback?error=1",
    "https://user:pass@de.example.com/callback",
    "https://10.0.0.5/callback",
    "https://box.internal/callback",
    "javascript:alert(1)",
    "not-a-url",
  ]) {
    expect(redirectUrlIsAllowed(bad), bad).toBe(false);
  }
});

test("Sign in with Polynet enforces PKCE S256, exact callback match, single-use codes, cross-app isolation, and pairwise user IDs", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  const asOwner = t.withIdentity({ subject: "owner-subject" });
  const asBuyer = t.withIdentity({ subject: "buyer-subject" });
  const asUnverified = t.withIdentity({ subject: "unverified-subject" });

  const callbackA = "https://app-a.example.com/api/auth/polynet/callback";
  const callbackB = "https://app-b.example.com/api/auth/polynet/callback";
  const appA = await asOwner.mutation(api.connectedApps.registerConnectedApp, {
    communityId: ids.communityId,
    name: "App A",
    appUrl: "https://app-a.example.com",
    redirectUrls: [callbackA],
  });
  const appB = await asOwner.mutation(api.connectedApps.registerConnectedApp, {
    communityId: ids.communityId,
    name: "App B",
    appUrl: "https://app-b.example.com",
    redirectUrls: [callbackB],
  });

  const verifier = "polynet_test_pkce_verifier_0123456789abcdefghijklmnopqrstuvwxyz";
  const challenge = await pkceS256Challenge(verifier);

  // Unregistered redirect URI and non-S256 PKCE fail closed.
  expect(
    await asBuyer.query(api.connectedApps.getConnectedAppAuthorizeContext, {
      clientId: appA.app_id,
      redirectUri: "https://evil.example.com/callback",
      codeChallenge: challenge,
      codeChallengeMethod: "S256",
    }),
  ).toEqual({ ok: false, error: "invalid_redirect_uri" });
  expect(
    await asBuyer.query(api.connectedApps.getConnectedAppAuthorizeContext, {
      clientId: appA.app_id,
      redirectUri: callbackA,
      codeChallenge: challenge,
      codeChallengeMethod: "plain",
    }),
  ).toEqual({ ok: false, error: "invalid_pkce" });

  // Valid consent context returns verified user and live community access.
  const ctxRes = await asBuyer.query(api.connectedApps.getConnectedAppAuthorizeContext, {
    clientId: appA.app_id,
    redirectUri: callbackA,
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
  });
  expect(ctxRes).toMatchObject({
    ok: true,
    redirect_uri: callbackA,
    app: { app_id: appA.app_id, name: "App A" },
    community: { slug: "de-pilot", name: "Distribution Engineer" },
    user: { email: "buyer@example.com", email_verified: true, is_blocked: false },
    access: { allowed: true, tier: { key: "member", name: "Connect" }, grants: ["community", "de:connect"] },
  });

  // Unverified user cannot approve sign-in.
  await expect(
    asUnverified.mutation(api.connectedApps.approveConnectedAppAuthorization, {
      clientId: appA.app_id,
      redirectUri: callbackA,
      codeChallenge: challenge,
      codeChallengeMethod: "S256",
    }),
  ).rejects.toThrow(/oauth_verified_email_required/);

  // Approve mints a one-time code; only its SHA-256 hash is stored.
  const approvedA = await asBuyer.mutation(api.connectedApps.approveConnectedAppAuthorization, {
    clientId: appA.app_id,
    redirectUri: callbackA,
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
  });
  expect(approvedA.code).toMatch(/^pcode_[a-f0-9]{48}$/);
  const storedCodes = await t.run((ctx) => ctx.db.query("connectedAppAuthCodes").collect());
  expect(storedCodes).toHaveLength(1);
  expect(JSON.stringify(storedCodes)).not.toContain(approvedA.code);

  const exchange = (secret: string, body: Record<string, string>, form = false) =>
    t.fetch("/apps/v1/oauth/token", {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": form ? "application/x-www-form-urlencoded" : "application/json",
      },
      body: form ? new URLSearchParams(body).toString() : JSON.stringify(body),
    });

  // Cross-app theft (App B trying to exchange App A's code) fails closed.
  expect(
    (await exchange(appB.secret, { grant_type: "authorization_code", code: approvedA.code, redirect_uri: callbackA, code_verifier: verifier })).status,
  ).toBe(400);
  // Wrong PKCE verifier fails closed.
  expect(
    (await exchange(appA.secret, { grant_type: "authorization_code", code: approvedA.code, redirect_uri: callbackA, code_verifier: `${verifier}X` })).status,
  ).toBe(400);
  // Wrong redirect_uri fails closed.
  expect(
    (await exchange(appA.secret, { grant_type: "authorization_code", code: approvedA.code, redirect_uri: callbackB, code_verifier: verifier })).status,
  ).toBe(400);

  // Valid exchange succeeds with verified user + pairwise ID + live access.
  const okRes = await exchange(appA.secret, {
    grant_type: "authorization_code",
    code: approvedA.code,
    redirect_uri: callbackA,
    code_verifier: verifier,
  });
  expect(okRes.status).toBe(200);
  const payloadA = await okRes.json();
  expect(payloadA).toMatchObject({
    user: { email: "buyer@example.com", email_verified: true, name: "buyer" },
    access: { allowed: true, tier: { key: "member", name: "Connect" }, grants: ["community", "de:connect"] },
  });
  expect(payloadA.user.id).toMatch(/^pusr_[a-f0-9]{32}$/);
  expect(payloadA.user.id).not.toContain(String(ids.buyerId));

  // Replay of the exact same code fails closed!
  const replay = await exchange(appA.secret, {
    grant_type: "authorization_code",
    code: approvedA.code,
    redirect_uri: callbackA,
    code_verifier: verifier,
  });
  expect(replay.status).toBe(400);
  expect(await replay.json()).toEqual({ error: "invalid_grant" });

  // Form-encoded exchange works for App B and returns a distinct pairwise user ID.
  const approvedB = await asBuyer.mutation(api.connectedApps.approveConnectedAppAuthorization, {
    clientId: appB.app_id,
    redirectUri: callbackB,
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
  });
  const okResB = await exchange(
    appB.secret,
    { grant_type: "authorization_code", code: approvedB.code, redirect_uri: callbackB, code_verifier: verifier },
    true,
  );
  expect(okResB.status).toBe(200);
  const payloadB = await okResB.json();
  expect(payloadB.user.id).toMatch(/^pusr_[a-f0-9]{32}$/);
  expect(payloadB.user.id).not.toBe(payloadA.user.id);

  // Blocked users are refused both new authorizations AND token exchange for previously issued codes.
  const preBlockCode = await asBuyer.mutation(api.connectedApps.approveConnectedAppAuthorization, {
    clientId: appA.app_id,
    redirectUri: callbackA,
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("communityBlocks", {
      communityId: ids.communityId,
      userId: ids.buyerId,
      createdByUserId: ids.ownerId,
      createdAt: NOW,
      updatedAt: NOW,
    } as any);
  });
  const blockedExchange = await exchange(appA.secret, {
    grant_type: "authorization_code",
    code: preBlockCode.code,
    redirect_uri: callbackA,
    code_verifier: verifier,
  });
  expect(blockedExchange.status).toBe(400);
  expect(await blockedExchange.json()).toEqual({ error: "invalid_grant" });

  // Malformed JSON and oversized token requests fail closed with invalid_request; lowercase bearer works.
  const malformedRes = await t.fetch("/apps/v1/oauth/token", {
    method: "POST",
    headers: { authorization: `bearer ${appA.secret}`, "content-type": "application/json" },
    body: "{not-json",
  });
  expect(malformedRes.status).toBe(400);
  expect(await malformedRes.json()).toEqual({ error: "invalid_request" });
  const oversizedRes = await t.fetch("/apps/v1/oauth/token", {
    method: "POST",
    headers: { authorization: `bearer ${appA.secret}`, "content-type": "application/json" },
    body: "x".repeat(4_100),
  });
  expect(oversizedRes.status).toBe(413);

  await expect(
    asBuyer.mutation(api.connectedApps.approveConnectedAppAuthorization, {
      clientId: appA.app_id,
      redirectUri: callbackA,
      codeChallenge: challenge,
      codeChallengeMethod: "S256",
    }),
  ).rejects.toThrow(/oauth_community_user_blocked/);

  // Incomplete account setup fails closed on OAuth authorize & approval.
  const asIncomplete = t.withIdentity({ subject: "incomplete-subject" });
  const incompleteCtx = await asIncomplete.query(api.connectedApps.getConnectedAppAuthorizeContext, {
    clientId: appA.app_id,
    redirectUri: callbackA,
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
  });
  expect(incompleteCtx).toMatchObject({ ok: true, user: { setup_required: true } });
  await expect(
    asIncomplete.mutation(api.connectedApps.approveConnectedAppAuthorization, {
      clientId: appA.app_id,
      redirectUri: callbackA,
      codeChallenge: challenge,
      codeChallengeMethod: "S256",
    }),
  ).rejects.toThrow(/oauth_account_setup_required/);

  // Removing a callback URL immediately invalidates already-issued auth codes for that URL.
  const asOwnerSigner = t.withIdentity({ subject: "owner-subject" });
  const preRemoveCode = await asOwnerSigner.mutation(api.connectedApps.approveConnectedAppAuthorization, {
    clientId: appB.app_id,
    redirectUri: callbackB,
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
  });
  await asOwner.mutation(api.connectedApps.updateConnectedApp, {
    communityId: ids.communityId,
    appId: appB.app_id,
    redirectUrls: ["https://app-b.example.com/api/auth/polynet/callback-v2"],
  });
  const removedCallbackRes = await exchange(appB.secret, {
    grant_type: "authorization_code",
    code: preRemoveCode.code,
    redirect_uri: callbackB,
    code_verifier: verifier,
  });
  expect(removedCallbackRes.status).toBe(400);
  expect(await removedCallbackRes.json()).toEqual({ error: "invalid_grant" });

  // Expired auth code pruning deletes expired rows while keeping live rows intact.
  const futureLiveCode = await asOwnerSigner.mutation(api.connectedApps.approveConnectedAppAuthorization, {
    clientId: appB.app_id,
    redirectUri: "https://app-b.example.com/api/auth/polynet/callback-v2",
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
  });
  expect(futureLiveCode.code).toMatch(/^pcode_/);
  await t.run(async (ctx) => {
    await ctx.db.insert("connectedAppAuthCodes", {
      codeHash: "expired_hash_1",
      appId: appB.app_id,
      communityId: ids.communityId,
      userId: ids.ownerId,
      redirectUri: callbackB,
      codeChallenge: challenge,
      codeChallengeMethod: "S256",
      expiresAt: Date.now() - 120_000,
      createdAt: Date.now() - 420_000,
    });
  });
  const pruned = await t.mutation(internal.connectedApps.pruneExpiredConnectedAppAuthCodesInternal, {
    nowMs: Date.now(),
  });
  expect(pruned.deleted).toBe(1);
  const remainingCodes = await t.run((ctx) => ctx.db.query("connectedAppAuthCodes").collect());
  expect(remainingCodes.some((row) => row.codeHash === "expired_hash_1")).toBe(false);
});

test("community landing page resolves return_app only for an active app belonging to that exact community", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  const asOwner = t.withIdentity({ subject: "owner-subject" });

  const ownApp = await asOwner.mutation(api.connectedApps.registerConnectedApp, {
    communityId: ids.communityId,
    name: "DE Studio",
    appUrl: "https://de.example.com",
  });
  const otherCommunityId = await t.run(async (ctx) =>
    ctx.db.insert("communities", {
      ownerId: ids.ownerId,
      slug: "other-club",
      name: "Other Club",
      lifecycleStatus: "active",
      lifecycleGeneration: 0,
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: NOW,
      updatedAt: NOW,
    } as any),
  );
  const otherApp = await asOwner.mutation(api.connectedApps.registerConnectedApp, {
    communityId: otherCommunityId,
    name: "Other App",
    appUrl: "https://other.example.com",
  });

  const matching: any = await t.query(api.communityLanding.getCommunityLandingPage, {
    communitySlug: "de-pilot",
    appId: ownApp.app_id,
  });
  expect(matching.return_app).toEqual({
    app_id: ownApp.app_id,
    name: "DE Studio",
    url: "https://de.example.com",
  });

  // Cross-community appId fails closed (returns null, never leaks or redirects).
  const cross: any = await t.query(api.communityLanding.getCommunityLandingPage, {
    communitySlug: "de-pilot",
    appId: otherApp.app_id,
  });
  expect(cross.return_app).toBeNull();

  // Checkout return query preserves selected tier / annual period alongside verified appId.
  expect(buildLandingCheckoutReturnQuery({ plan: "pro", billingPeriod: "monthly", appId: ownApp.app_id }))
    .toBe(`&plan=pro&app=${ownApp.app_id}`);
  expect(buildLandingCheckoutReturnQuery({ plan: null, billingPeriod: "annual", appId: ownApp.app_id }))
    .toBe(`&period=annual&app=${ownApp.app_id}`);
  expect(buildLandingCheckoutReturnQuery({ plan: null, billingPeriod: "monthly", appId: null })).toBe("");
});
