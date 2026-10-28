---
id: product.funnel
title: Community Funnel
audience: builder, member, llm
status: alpha-current
last_verified: 2026-10-28
---

# Community Funnel

## Definition

A community funnel is the canonical public entry surface for a community.

## Why It Exists

Builders need one reliable link they can share from YouTube, social posts, email, direct messages, and other distribution channels. The funnel explains the community and sends the user into the correct join, approval, checkout, or sign-in path.

## User Mental Model

For builders, their community site on `<slug>.polynet.page` (or their own
website) is the marketing front door. The Polynet `/c/:slug` link is the
shareable route for joining or paying, and sites link to it.

For members, a Discover card opens the Polynet landing page, which explains what
they need to do to join.

## System Mental Model

Every community has one deterministic Polynet landing page assembled from its
canonical identity and access state: name, branding, the one-line description
and About when supplied, one join action, and any necessary access-status
message. It is the join,
sign-in, approval, and checkout destination.

The custom funnel builder, its AI composer, draft previews, and the external
website link were removed on Oct 28, 2026. Old `/c/:slug/funnel` links open
Community Settings and old draft-preview links open the landing page. Stored
drafts remain for audit until the funnel data is deleted.

## Entry Paths

Signing in establishes identity; it never creates community membership.

- A signed-in user with no requested community lands on the community they
  most recently viewed (server-recorded presence), then a community they own,
  then their most recently activated active membership, then Discover. Every
  candidate must pass current access checks.
- Polynet home (`/c/polynet`) is joined like any other community, through its
  public funnel and entry policy. There is no automatic platform-home
  membership.

## Rules

1. The Polynet landing page is the canonical public entry surface for join and
   gate flows. A community site or website is only a marketing destination.
2. Landing page visibility does not imply community access.
3. Published communities can still be gated.
4. Unlisted communities can still be shared by direct link.
5. Checkout, approval, and membership creation must be verified by backend state.
6. Landing page actions are UX; backend entitlement is authority.
7. The landing page is deterministic and not AI-authored.

## Non-Goals

Polynet does not offer a custom funnel composer or page builder. Founders build
their front door as a community site.

## Related Concepts

- `community`
- `entitlement`
- `billing-entitlements`
- `access-model`
