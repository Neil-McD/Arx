---
id: product.funnel
title: Community Funnel
audience: builder, member, llm
status: alpha-current
last_verified: 2026-04-26
---

# Community Funnel

## Definition

A community funnel is the canonical public entry surface for a community.

## Why It Exists

Builders need one reliable link they can share from YouTube, social posts, email, direct messages, and other distribution channels. The funnel explains the community and sends the user into the correct join, approval, checkout, or sign-in path.

## User Mental Model

For builders, the funnel is the shareable front door.

For members, the funnel is where they understand what the community is and what they need to do to join.

## System Mental Model

The funnel is a public-facing surface. It can show community profile information, but it is not the same thing as access to the real community surface.

## Rules

1. The funnel is the canonical public entry surface for join and gate flows.
2. Funnel visibility does not imply community access.
3. Published communities can still be gated.
4. Unlisted communities can still be shared by direct funnel link.
5. Checkout, approval, and membership creation must be verified by backend state.
6. Funnel actions are UX; backend entitlement is authority.

## Non-Goals

The funnel is not the same thing as a general landing-page builder during MVP.

## Related Concepts

- `community`
- `entitlement`
- `billing-entitlements`
- `access-model`

