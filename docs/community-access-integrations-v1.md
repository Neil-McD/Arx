# Community access integrations, v1

An outside service (for example a paid MCP server) can ask Polynet who may use
it, and hear the moment that changes. Polynet stays the one place access is
decided: the membership, its subscription and any access the owner gave by hand.
Nothing here stores a second copy of access.

The owner connects a service in **Settings → Access → Connected services**. That
screen shows the API key and signing secret once.

## The rule

A member is covered by an integration when all of these hold:

- their membership is active (or they own the community), and
- they are not a test member (Workflows → Test run), and
- one of:
  - they pay through a plan the integration covers (no plans picked = every paid plan),
  - the owner gave them access by hand and the integration includes such access,
  - they own the community.

Free members are never covered. Anything unknown answers "not covered".

## Lookup API

Base: `<CONVEX_SITE_URL>/access/v1/communities/<slug>` (Settings → Access shows it).
Every call sends `Authorization: Bearer pna_…` (the integration's API key). A
wrong or revoked key gets `401 {"error":"unauthorized","access":{"entitled":false}}`.
Answers are JSON with `Cache-Control: no-store`.

| Call | Finds |
| --- | --- |
| `GET /members?email=<email>` | a member whose **verified** email matches |
| `GET /members/<member id>` | a member by the stable id Polynet gives them (`pm_…`) |
| `GET /members[?cursor=…]` | everyone, 50 a page, `next_cursor` until `null` |
| `POST /licenses/verify` with `{"key":"pnk_…"}` | the member who owns a license key |

A license key only ever travels in a POST body, so it stays out of URLs and logs.

A found member:

```json
{
  "found": true,
  "community": { "slug": "ai-employee-builders", "name": "AI Employee Builders" },
  "member": { "id": "pm_3kq…", "email": "thomas@example.com", "email_verified": true },
  "access": {
    "entitled": true,
    "source": "paid_subscription",
    "status": "active",
    "price_point": "<price point id>",
    "plan_name": "Monthly",
    "billing_period": "month",
    "current_period_end": "2026-11-06T00:00:00.000Z",
    "renews_at": "2026-11-06T00:00:00.000Z",
    "ends_at": null,
    "ended_at": null
  },
  "checked_at": "2026-10-25T10:00:00.000Z"
}
```

Nobody found (unknown email, unverified email, someone else's key, a revoked
key): `200 {"found": false, "access": {"entitled": false}, "checked_at": …}`.

`status` is one of `owner`, `active`, `past_due`, `cancelling`, `granted`
(given by hand), `free`, `ended`, `none`. `source` is `paid_subscription`,
`manual_grant`, `free_grant`, `owner` or `null`.

## Continue with Polynet (sign-in)

A service can let members sign in with their Polynet account instead of pasting
a key. Send the member's browser to:

`<POLYNET_WEB_URL>/connect/polynet?community=<slug>&return_url=<your callback>&state=<your opaque state>`

`return_url` must be on the same site (scheme, host and port) as the
integration's webhook address. The member signs in if needed and sees what is
shared (their email and whether their membership is active). On **Allow**,
their browser comes back to `return_url?code=pnc_…&state=…`; on **Cancel**,
`return_url?error=access_denied&state=…`. Check `state` yourself.

Redeem the code server to server, once, within five minutes:

`POST /access/v1/communities/<slug>/sign-in/redeem` with
`{"code": "pnc_…", "return_url": "<the exact same return_url>"}` and the API key.

The answer is the same as a lookup. A used, expired, unknown or mismatched code
answers `200 {"found": false, …}`. A code only works with the integration whose
return address it was made for.

## Webhook

Polynet POSTs JSON to the integration's webhook address whenever what that
integration would answer for a member changes (a payment, a cancellation, a
grant given, changed or ending, someone leaving, a plan going past due). A new
integration first hears about everyone who already has access.

Headers:

- `Polynet-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>" with the signing secret>`
- `Polynet-Event-Id`, `Polynet-Event-Type`, `Polynet-Delivery-Attempt`

Check the signature against the raw body, reject a `t` more than 5 minutes
old, and answer `2xx` once stored. Anything else is retried (1m, 5m, 15m, 1h,
3h, then every 6h) for 72 hours; `4xx` other than 408/409/425/429 stops at once.
Failed deliveries show in Settings → Access → Deliveries with a Retry button.

`membership.access_changed`:

```json
{
  "type": "membership.access_changed",
  "event_id": "evt_…",
  "idempotency_key": "pm_3kq…:4",
  "sequence": 4,
  "reason": "subscription_canceled",
  "community": { "slug": "…", "name": "…" },
  "member": { "id": "pm_3kq…", "email": "…", "email_verified": true },
  "access": { "entitled": false, "status": "ended", "…": "as in the lookup" },
  "occurred_at": "2026-10-25T10:00:00.000Z"
}
```

`sequence` rises by one per member per integration. Keep the highest you have
stored and ignore anything lower, so a late retry never undoes a newer change.

`integration.test` (the Send test button) carries only `type`, `event_id`,
`community` and `occurred_at`.

## License keys

Each member makes their own key in the community's Settings (`pnk_<slug>_…`).
Polynet keeps only its SHA-256. Making a new key stops the old one; the owner
can revoke a member's key from Workflows → Clients. A key answers "covered" only
while the member's access does, so ending access ends the key's use too.

## Local development

On a local deployment (`CONVEX_SITE_URL` on 127.0.0.1 or localhost, or
`POLYNET_ACCESS_ALLOW_LOOPBACK_WEBHOOKS=1`) the webhook may be a
`http://localhost` address. Everywhere else it must be public `https`.
