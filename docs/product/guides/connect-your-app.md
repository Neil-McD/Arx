---
id: product.guide.connect_your_app
title: Connect Your App
audience: builder, llm
status: alpha-current
last_verified: 2026-11-12
---

# Connect Your App

## Goal

Your product and your Polynet community, with one set of plans. Someone who buys
from you gets your community too; someone who belongs to your community gets the
plan they paid for in your app. Your app keeps its own sign-in and checkout.

## The One Rule

The commission follows the checkout:

- Sold through **your own checkout** (and reported to Polynet): no Polynet fee.
- Sold through **Polynet's checkout**: Polynet's 2.9% platform fee.

A person's access is the union of both: whichever side sold them a plan, they
have it. Nothing is copied back and forth.

## What You Need

From Polynet → your community → Manage → **Your app** (shown once when you
connect the app):

- `POLYNET_APP_SECRET`: starts with `psk_`. Server only. Never in browser code,
  never committed.
- `POLYNET_WEBHOOK_SECRET`: starts with `whsec_`. For checking Polynet's
  webhooks. Only needed if you set a webhook address.
- `POLYNET_API_ORIGIN`: Polynet's API address, shown under Your app.

Your **plans** are in Manage → **Plans**. Each has a key (the base membership
is always `member`) and **grants**: the names your app checks, such as
`yourapp:pro`. Every member also holds `community`, and `pod:<slug>` for each pod
they are in. Gate features on grants, never on prices.

## 1. Report Your Own Sales

Whenever a subscription in your billing system is created, renewed, changes plan,
or ends, tell Polynet the person's **current** state. Send the whole state every
time; the latest report per email wins, so a missed one is corrected by the next.

```http
POST {POLYNET_API_ORIGIN}/apps/v1/sales
Authorization: Bearer {POLYNET_APP_SECRET}
Content-Type: application/json

{ "email": "buyer@example.com", "active": true, "tier": "pro", "external_ref": "sub_123" }
```

- `active`: `true` while they should have access (Stripe `active`, `trialing`,
  `past_due`), `false` once it ends (`canceled`, `unpaid`, `incomplete_expired`).
- `tier`: the plan key in Polynet. Leave it out for the base membership.
- `external_ref`: optional, your own subscription id, for tracing.

The response says what happened: `in`, `waiting_for_account` (no Polynet account
with that verified email yet; they're let in when they sign up with it),
`kept_out` (they left, were removed or are blocked; a sale never puts them back,
but someone who left can join again themselves without paying twice),
`ended`, or `kept_by_other_access` (something else still lets them in).

Do this after your own billing has recorded the change, and never let it fail
your billing: log errors and move on.

```ts
export async function reportSaleToPolynet(sale: { email: string; active: boolean; tier?: string; externalRef?: string }) {
  const origin = process.env.POLYNET_API_ORIGIN;
  const secret = process.env.POLYNET_APP_SECRET;
  if (!origin || !secret) return; // not connected: do nothing
  try {
    const response = await fetch(`${origin.replace(/\/+$/, "")}/apps/v1/sales`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({
        email: sale.email.trim().toLowerCase(),
        active: sale.active,
        ...(sale.tier ? { tier: sale.tier } : {}),
        ...(sale.externalRef ? { external_ref: sale.externalRef } : {}),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) console.error("polynet sale report refused", response.status);
  } catch (error) {
    console.error("polynet sale report failed", error);
  }
}
```

## 2. Ask What Someone Has

From your server, with a **verified** email (one your sign-in has confirmed):

```http
GET {POLYNET_API_ORIGIN}/apps/v1/access?email=buyer%40example.com
Authorization: Bearer {POLYNET_APP_SECRET}
```

```json
{ "allowed": true, "tier": { "key": "pro", "name": "Pro" }, "grants": ["community", "yourapp:pro"] }
```

- `allowed` is Polynet's own decision: a live Polynet subscription, a sale you
  reported, or a free or comped membership. Blocked people and archived
  communities are never allowed.
- Someone unknown, unverified or not a member gets the same answer:
  `{ "allowed": false, "tier": null, "grants": [] }`.
- `tier` is the highest plan they hold; `grants` are all of them.

Combine it with your own records: a person can use a feature if **your own
billing** gives it or **Polynet's grants** include it. If Polynet can't be
reached, fall back to your own records only (fail closed for Polynet-sourced
access). A short cache (up to a minute) is fine; the webhook below tells you when
to drop it.

```ts
export async function polynetAccess(email: string): Promise<{ allowed: boolean; grants: string[] }> {
  const origin = process.env.POLYNET_API_ORIGIN;
  const secret = process.env.POLYNET_APP_SECRET;
  if (!origin || !secret) return { allowed: false, grants: [] };
  try {
    const url = `${origin.replace(/\/+$/, "")}/apps/v1/access?email=${encodeURIComponent(email.trim().toLowerCase())}`;
    const response = await fetch(url, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return { allowed: false, grants: [] };
    const body = await response.json();
    return { allowed: body.allowed === true, grants: Array.isArray(body.grants) ? body.grants : [] };
  } catch {
    return { allowed: false, grants: [] };
  }
}
```

## 3. Hear When It Changes (Optional)

If you set a webhook address (public `https` only), Polynet sends
`access.changed` whenever someone's access may have changed: they joined, paid,
lapsed, left, were removed, changed pods, or a plan's grants changed. It carries
only the email. Ask the access check again; don't trust anything else in it.

It follows [Standard Webhooks](https://www.standardwebhooks.com): headers
`webhook-id`, `webhook-timestamp`, `webhook-signature`. The signature is
`v1,` + base64 HMAC-SHA256 of `{id}.{timestamp}.{raw body}`, keyed with the
base64 part of `POLYNET_WEBHOOK_SECRET` (after `whsec_`). Reject anything more
than five minutes old, and use `webhook-id` to ignore repeats (it stays the
same when Polynet retries). Answer `2xx` quickly; Polynet retries for a day.

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export async function handlePolynetWebhook(request: Request): Promise<Response> {
  const id = request.headers.get("webhook-id") ?? "";
  const timestamp = request.headers.get("webhook-timestamp") ?? "";
  const signatures = (request.headers.get("webhook-signature") ?? "").split(" ");
  const body = await request.text();
  const secret = process.env.POLYNET_WEBHOOK_SECRET ?? "";
  if (!id || !timestamp || !secret) return new Response(null, { status: 400 });
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return new Response(null, { status: 400 });
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
  const valid = signatures.some((candidate) =>
    candidate.length === expected.length && timingSafeEqual(Buffer.from(candidate), Buffer.from(expected)));
  if (!valid) return new Response(null, { status: 401 });
  // if (await alreadyHandled(id)) return new Response(null, { status: 200 });
  const event = JSON.parse(body) as { type: string; data: { email: string } };
  if (event.type === "access.changed") {
    // Drop any cached access for event.data.email; the next request asks again.
  }
  return new Response(null, { status: 200 });
}
```

## 4. Link Both Ways

Buyers should never hunt for the other half of what they bought.

**Polynet → your app.** Set your app's address under Your app. Every member then
sees a link to it in your community's left column. Nothing to build. If your app
tracks its own links, the address can be one of your tracked links, so your
reports show the community as a source.

**Your app → Polynet.** Add a link to your community. Its address is shown
under Your app (`https://…/c/<your-community>`). It is also the invite:
someone who bought in your app signs in to Polynet with the same verified email
and lands inside, no second purchase.

Where to put it is your call. Good places, most useful first:

1. **After purchase**: on your success or welcome screen, "Join the
   community". This is the moment the buyer is most likely to go.
2. **Main navigation**: a "Community" item in your sidebar, top bar or app
   menu, so it is always one click away.
3. **Onboarding**: a step or checklist item in your first-run flow.
4. **Account or billing page**: next to the plan, "Your plan includes the
   community".
5. **Help menu**: "Ask the community" beside your docs and support.
6. **Welcome email**: a line with the link.

Open it in a new tab. Show it only to people whose plan includes the community
(everyone with an active plan, unless you sell plans without it). Use your own
design system; the word "Community" (or your community's name) is enough.

## Rules

- The secrets live in server environment variables only.
- Only send emails your sign-in has verified.
- Never let a Polynet call fail or block your own billing or sign-in.
- Gate on grants, not prices or plan names.
- Polynet never needs your users' passwords, and you never need theirs.
- Test against Polynet's staging with test purchases only. Never send real
  customers to a test Polynet: give your app a switch for who it reports
  (your test buyers while testing, real buyers once live on production).

## Check It Works

1. Connect the app in Polynet and set the environment variables.
2. Make a test purchase in your app (test mode). Polynet's response should be
   `in`, and the buyer appears in Members as "Through your app".
3. Call the access check for that email: `allowed: true` with your plan's grants.
4. Cancel the test subscription: the report returns `ended` and the access check
   returns `allowed: false`.
5. Open your community: your app's link is in the left column. Click the
   community link in your app: it opens your community.
