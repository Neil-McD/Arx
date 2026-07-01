# URL Routing Contract v1

## Goal

Define one simple, durable URL grammar for Polynet so future work on communities, users, apps, and public funnels does not improvise route structure.

This is a contract document, not an implementation rewrite.

## First Principles

A URL should answer only three questions:

1. What kind of thing is this?
2. Which specific thing is it?
3. Which page or view of that thing is it?

If the URL does not answer those clearly, routing drifts.

## Current Model

Today the app uses pathname as the canonical route contract.

Current canonical/pathname routes include:

- `/discover`
- `/workspace`
- `/workspace/:communitySlug`
- `/workspace/thread/:threadId`
- `/settings/profile`
- `/settings/account`
- `/settings/agent`
- `/settings/appearance`
- `/c/:slug`
- `/c/:slug/chat`
- `/c/:slug/ai-feed`
- `/c/:slug/resources`
- `/c/:slug/settings`
- `/c/:slug/agent`
- `/c/:slug/funnel`
- `/c/:slug/analytics`
- `/checkout/success`
- `/claim`

## Canonical Direction

Polynet should have four route classes:

1. Platform routes
2. Public entity routes
3. Internal operating routes
4. Transactional routes

## Platform Routes

These are top-level application destinations:

- `/workspace`
- `/discover`
- `/settings/profile`
- `/settings/account`
- `/settings/agent`
- `/settings/appearance`

These should represent actual page identity.

## Public Entity Routes

Use explicit namespaces.

### Communities

- `/c/:slug`

This is the public community home / funnel.

### Users

- `/u/:handle`

This is the future public user profile route.

### Apps

- `/app/:slug`

This is the future public app profile route.

## Why Namespaces Exist

Bare slugs like `/:slug` are only acceptable if the platform guarantees one global namespace across:

- communities
- users
- apps
- reserved platform pages

That is possible, but it creates avoidable collision and migration risk.

So the contract direction is:

- keep `/c/:slug`
- use `/u/:handle`
- use `/app/:slug`

## Internal Operating Routes

Public object pages and internal operating views should not be the same route with hidden app state.

For communities, the public funnel and internal community operating surface should eventually be distinct.

Preferred direction:

- `/c/:slug` = public funnel
- `/c/:slug/chat`
- `/c/:slug/ai-feed`
- `/c/:slug/resources`
- `/c/:slug/settings`
- `/c/:slug/agent`
- `/c/:slug/funnel`
- `/c/:slug/analytics`

This keeps object identity stable while making the active view explicit.

For workspace operating routes, the same principle applies:

- `/workspace`
- `/workspace/:communitySlug`
- `/workspace/thread/:threadId`

This is now the active route direction in the web app.

`/workspace/community/:slug` is accepted as a legacy compatibility route. Normal community workspace routes should
canonicalize to `/workspace/:communitySlug`; reserved workspace segments use the legacy route as an escape hatch.

## Transactional Routes

Keep special transactional routes explicit and separate from entity routes:

- `/checkout/success`
- `/claim`

These are not entity homes and should not be overloaded into other route families.

## Rules

1. `pathname` should own page identity.
2. `hash` should not own major page/view navigation.
3. Public funnel and internal operating views should not share one route with hidden app-state differences.
4. Entity namespaces should remain explicit.
5. Do not add new public entity classes without defining their namespace first.

## Transitional Note

Old hash-based deep links are no longer part of the supported route contract.

New work should use pathname routes only, and controllers should not assume hash-owned page identity.

## Best Next Steps

1. Treat this document as the canonical routing direction.
2. Keep new public entities aligned with namespace-based routing.
3. When implementing public user profiles or app profiles, use:
   - `/u/:handle`
   - `/app/:slug`
4. When touching major navigation again, move pathname toward owning page identity directly.
