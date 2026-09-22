---
id: product.funnel
title: Community Funnel
audience: builder, member, llm
status: alpha-current
last_verified: 2026-09-22
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

Every community has one deterministic fallback assembled from canonical
community identity and access state. A builder
may also maintain one custom funnel through the bounded AI-assisted composer.
Existing custom work remains private until explicitly published, and publishing does not
change which funnel is live. One explicit active-funnel selector determines
whether the fallback or published custom funnel is served publicly.

Custom funnels use one platform-owned composition: community identity,
outcome-focused headline and subheadline, an optional founder-managed Video
Sales Letter, a canonical join action, exactly three benefit pillars, a
long-form narrative, canonical live member proof, and the same join action
again. The agent edits only the headline, subheadline, pillars, and narrative.
Polynet owns theme, layout, media placement, member proof, pricing, access
language, and both actions.

## Rules

1. The Polynet funnel is the canonical public entry surface for join and gate
   flows. An external website is only a marketing destination.
2. Funnel visibility does not imply community access.
3. Published communities can still be gated.
4. Unlisted communities can still be shared by direct funnel link.
5. Checkout, approval, and membership creation must be verified by backend state.
6. Funnel actions are UX; backend entitlement is authority.
7. The deterministic fallback always remains available and is not AI-authored.
8. Custom drafts, published snapshots, and the active funnel are separate state.
9. A custom funnel cannot become active unless the exact reviewed published
   revision is still current.
10. AI may revise bounded funnel content, but cannot grant access, set payment
    authority, silently publish, or silently change the active funnel.
11. Funnel V2 content cannot carry theme, layout, media, member, pricing,
    access, or CTA authority.
12. Long-form copy is bounded Markdown; raw HTML, links, images, code, and
    executable content are not rendered.
13. An external website link is manager-controlled and never changes join,
    checkout, membership, pricing, or the currently published Polynet funnel.
14. An untested or changed website URL is not exposed through Discover.

## Non-Goals

The funnel composer is not a general landing-page builder, arbitrary HTML
editor, hosting platform, or multi-step marketing-automation system during MVP.

## Related Concepts

- `community`
- `entitlement`
- `billing-entitlements`
- `access-model`
