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

## Legacy Workspace Compatibility

`/workspace`, `/workspace/:communitySlug`, `/workspace/community/:slug`, and
`/workspace/thread/:threadId` are no longer product destinations. They remain
recognized only as migration inputs while the protected runtime substrate is
isolated for later reuse.

Legacy entry is auth-aware:

- authenticated entry resolves through the server-authoritative member
  destination action and opens an authorized community or Discover;
- signed-out community entry opens `/c/:slug`;
- signed-out generic or thread entry opens `/`;
- old community launch setup URLs restore under `/c/:slug/settings/community`.

New code must not generate a `/workspace*` URL. The browser exposes no Workspace
page type, route builder, or navigation controller. Inbound classification is
the sole retained browser compatibility seam. The MCP `workspace_context` wire
term remains intact because it is protocol compatibility substrate, not product
navigation.

Transactional emails, digests, and reminders follow the same rule. If a
community-specific URL cannot be constructed, they fall back to `/discover`,
never to a legacy Workspace route.

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
4. Continue deleting first-party Workspace references only after their runtime,
   billing, and MCP responsibilities have explicit community-scoped owners.
