---
id: product.funnel
title: Community Funnel
audience: builder, member, llm
status: alpha-current
last_verified: 2026-09-28
---

# Community Funnel

## Definition

A community funnel is the canonical public entry surface for a community.

## Why It Exists

Builders need one reliable link they can share from YouTube, social posts, email, direct messages, and other distribution channels. The funnel explains the community and sends the user into the correct join, approval, checkout, or sign-in path.

## User Mental Model

For builders, their own website may be the marketing front door. The Polynet
`/c/:slug` link remains the shareable route for joining or paying.

For members, a Discover card opens the short Polynet landing page by default.
It opens the builder's website only after the builder activates that URL. The
Polynet gate explains what they need to do to join.

## System Mental Model

The builder may save one public HTTPS website URL in Community Settings. Saving
the URL leaves the Polynet landing page active. The builder then tests their
website's Join button against `/c/:slug` and explicitly activates the URL.
Discover sends visitors to the active website, while existing members still
enter the community. Changing or removing the URL returns Discover to the
Polynet page until the new URL is tested and activated. This test is the
builder's confirmation, not continuous monitoring or domain ownership proof.
The website must link back to `/c/:slug` for sign-in, approval, or checkout.
The website itself does not create membership or payment authority. The
Polynet route remains directly accessible. Its default landing page contains
community identity, the one-line description when supplied, one join action,
and any necessary access-status message.

Every community has a deterministic Polynet landing page assembled from its
canonical identity and access state. Community Settings > Product website lets
the owner save and activate an external marketing destination for Discover.
The Polynet `/c/:slug` page remains available for a direct share and as the
join, sign-in, approval, or checkout destination from the owner's website.

The custom funnel builder is retired from navigation. Old `/c/:slug/funnel`
links open Community Settings, and old draft-preview links open the public
Polynet landing page. New builder model runs, draft edits, VSL edits,
publication, and active-slot changes are rejected by the backend. Stored
private drafts, published snapshots, and paid builder receipts remain for
audit; this slice does not delete or migrate them.

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

1. The Polynet funnel is the canonical public entry surface for join and gate
   flows. An external website is only a marketing destination.
2. Funnel visibility does not imply community access.
3. Published communities can still be gated.
4. Unlisted communities can still be shared by direct funnel link.
5. Checkout, approval, and membership creation must be verified by backend state.
6. Funnel actions are UX; backend entitlement is authority.
7. The default Polynet landing page is deterministic and not AI-authored.
8. An external website URL is manager-controlled and never changes join,
   checkout, membership, pricing, or entitlement authority.
9. An untested or changed website URL is not exposed through Discover.
10. Retired custom-funnel write APIs fail closed for older clients while
    historical records remain readable for audit.

## Non-Goals

Polynet does not offer a custom funnel composer or page-hosting builder in the
MVP. Website activation is a builder-confirmed join-link test, not automated
monitoring or domain ownership verification.

## Related Concepts

- `community`
- `entitlement`
- `billing-entitlements`
- `access-model`
