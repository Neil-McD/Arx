# Community Funnel Contract (Web2 MVP)

This contract defines one canonical public funnel entry for communities:

- Public entry URL: `/c/:slug`
- Canonical resolver: `public.get_public_community_funnel_by_slug(p_community_slug text)`
- Canonical edge endpoint for funnel actions: `functions/v1/public_funnel`

## First-principles semantics

- The community URL is the share link.
- Join behavior is server-resolved, not inferred by clients:
  - `checkout`: there is at least one active paid option.
  - `request_access`: free private OR free public/unlisted with approvals enabled.
  - `join_free`: free public/unlisted with auto-approve enabled.
- One active option per billing period (`monthly`, `yearly`) can exist at a time.
- External funnels and native Arx landing use the same conversion endpoint shape.

## SQL contract

### `public.get_public_community_funnel_by_slug(text)`

Returns one row with:

- community identity and metadata (`slug`, `name`, visibility/media fields)
- `join_mode`
- `active_plans` JSON array (monthly/yearly options)

### `public.capture_community_funnel_lead_by_slug(...)`

Service-role only function to ingest leads from public funnels:

- upserts to `public.community_funnel_leads`
- emits `identity.email_captured` automation event (idempotent)

### `public.get_community_funnel_config(uuid)` / `public.save_community_funnel_config(uuid, boolean, jsonb)`

Owner/admin funnel-schema management:

- one row per community in `public.community_funnel_configs`
- `is_enabled` gate for custom funnel rendering
- `schema_json` stores guarded builder output

### `public.get_public_community_funnel_config_by_slug(text)`

Public read projection used by edge resolve:

- returns `is_enabled`, `schema_json`, `updated_at`
- available for `public`, `private`, and `unlisted` community slugs

## Edge contract

### `POST /functions/v1/public_funnel`

Request payload:

```json
{
  "intent": "resolve | capture_email | checkout",
  "community_slug": "your-community-slug",
  "billing_period": "monthly | yearly",
  "success_url": "https://app.example.com/checkout/success",
  "cancel_url": "https://app.example.com/c/your-community-slug",
  "email": "lead@example.com",
  "full_name": "Lead Name",
  "source": "public_funnel",
  "metadata": {},
  "tracking": { "brandos_aid": "uuid-or-null" }
}
```

#### `intent = "resolve"`

Response includes:

- community metadata
- `join_mode`
- `active_plan` + `active_plans`
- derived action booleans (`can_join_free`, `can_request_access`, `can_checkout`)
- public funnel payload (`funnel.enabled`, `funnel.schema_json`, `funnel.updated_at`)

#### `intent = "capture_email"`

Response includes:

- canonical lead row summary (community, email, first/last seen, capture count)

#### `intent = "checkout"`

Response includes:

- Stripe checkout URL/session IDs from canonical `checkout_start` flow

## Current Web2 usage

- `/c/:slug` landing resolves through `public_funnel` (`intent = "resolve"`).
- Landing checkout CTA now calls `public_funnel` (`intent = "checkout"`), so external and native funnel checkout behavior is aligned.
- Members tab now exposes captured lead review for owners/admins.

## What this does not include yet

- Visual funnel page builder UI
- AI section generation/editor
- Public lead dashboard UI on members/admin pages

Those can be built on top of this contract without changing conversion semantics.
