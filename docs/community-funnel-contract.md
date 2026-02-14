# Community Landing Contract (MVP)

This contract defines the single public community entry surface used in MVP:

- Public entry URL: `/c/:slug`
- Canonical resolver endpoint: `POST /functions/v1/public_funnel` with `intent = "resolve"`
- Canonical checkout endpoint: `POST /functions/v1/public_funnel` with `intent = "checkout"`

## First-principles semantics

- A community share link always resolves through `/c/:slug`.
- Visibility is simplified to `published` and `unlisted`; entry remains gated by join policy.
- Join behavior is server-resolved, not inferred by clients:
  - `checkout`: community has at least one active paid plan.
  - `request_access`: community requires approval before joining.
  - `join_free`: community allows immediate free join.
- One active plan per billing period (`monthly`, `yearly`) can exist at a time.

## Runtime contract

### `POST /functions/v1/public_funnel`

Request payload:

```json
{
  "intent": "resolve | checkout",
  "community_slug": "your-community-slug",
  "billing_period": "monthly | yearly",
  "success_url": "https://app.example.com/checkout/success",
  "cancel_url": "https://app.example.com/c/your-community-slug",
  "tracking": { "brandos_aid": "uuid-or-null" }
}
```

#### `intent = "resolve"`

Response includes:

- community metadata for landing
- canonical `join_mode`
- `active_plan` and `active_plans` summary

#### `intent = "checkout"`

Response includes:

- checkout URL/session created via canonical paid-join flow

## Access/join RPCs used by web controller

- `get_my_community_access_by_slug`
- `get_my_join_request_by_slug`
- `request_community_access_by_slug`
- `join_public_community_by_slug` (or `join_public_community` by ID)

## Explicitly out of MVP contract

- Public lead capture (`intent = "capture_email"`)
- Community funnel schema/config storage
- Funnel leads owner/admin review surface
- Multi-template funnel builder behavior
