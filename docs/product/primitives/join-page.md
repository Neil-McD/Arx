---
id: product.join_page
title: Join Page
audience: builder, member, llm
status: alpha-current
last_verified: 2026-10-28
---

# Join Page

## Definition

Every community has one join page at `/c/<slug>` on Polynet. It is the
canonical place to join, sign in, request approval, or pay for access. Older
docs and links call it the community funnel.

## Why It Exists

Founders need one reliable link they can share from YouTube, social posts,
email, direct messages, and their own site. The join page explains the
community and sends each person into the correct join, approval, checkout, or
sign-in path.

## User Mental Model

For founders, the community site (or their own website) is the marketing front
door. The join page is the shareable link for joining or paying, and sites link
to it.

For members, a Discover card or a shared link opens the join page, which says
what they need to do to get in.

## System Mental Model

The join page is assembled deterministically from the community's identity and
access state: name, branding, the one-line description and About when
supplied, one join action, and any access-status message. Founders do not
author it, and AI does not write it.

The custom funnel editor, its AI composer, draft previews, and the external
website link were removed on October 28, 2026. Old `/c/<slug>/funnel` links
open Community Settings, and old draft-preview links open the join page.

## Entry Paths

Signing in establishes identity; it never creates community membership.

- A signed-in user with no requested community lands on the community they
  most recently viewed, then a community they own, then their most recently
  activated membership, then Discover. Every candidate must pass current access
  checks.
- Polynet home (`/c/polynet`) is joined like any other community, through its
  join page and entry policy. There is no automatic platform-home membership.

## Rules

1. The join page is the canonical public entry surface for join and gate flows.
   A community site or website is only a marketing destination.
2. Join page visibility does not imply community access.
3. Published communities can still be gated.
4. Unlisted communities can still be shared by direct link.
5. Checkout, approval, and membership creation must be verified by backend
   state.
6. Join page actions are UX; backend entitlement is authority.
7. The join page is deterministic and not AI-authored.

## Non-Goals

Polynet does not offer a funnel composer or page builder. Founders build their
front door as a community site.

## Related Concepts

- `community`
- `community-site`
- `entitlement`
- `billing-entitlements`
- `access-model`
