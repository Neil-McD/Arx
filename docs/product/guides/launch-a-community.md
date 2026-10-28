---
id: product.guide.launch_community
title: Launch a Community
audience: builder, llm
status: alpha-current
last_verified: 2026-10-28
---

# Launch a Community

## Goal

Create a community that can be discovered, shared through its join page,
joined by members, and served by its community agent.

The goal is not to configure every possible setting. The goal is one coherent
entry path and one coherent member experience.

## Setup Checklist

1. Name the community.
2. Set the slug and profile copy (one-line description and About).
3. Upload or configure brand assets.
4. Choose visibility: Published or Unlisted.
5. Configure entry policy and access.
6. Configure billing if the community is paid.
7. Configure roles for trusted operators.
8. Add resources and the agent's community instructions.
9. Share the join page link.

## Community Identity

The community identity should answer:

- what the community is called
- who it is for
- what problem it solves
- why the agent and community are useful together

Keep the profile copy concrete. Avoid vague claims like "collaborate better"
unless the specific workflow is obvious. The join page is generated from this
copy, so it is the public explanation people see before joining.

## Visibility

Polynet uses two visibility states:

- `Published`: listed in Discover and publicly viewable according to product
  surface rules
- `Unlisted`: distributed by direct link

Visibility is not access. A published community can still require membership,
approval, payment, or entitlement.

## Join Page

The join page (`/c/<slug>`) is the shareable public entry surface.

Use its link in:

- YouTube descriptions
- social posts
- email
- direct messages
- paid acquisition
- community invites
- your community site or website

The join page explains the community and routes the person into sign-in, join,
approval, or checkout. It does not grant the real community surface by itself.

## Access Setup

Access should be understandable before launch:

- open join
- approval-gated join
- paid subscription

Do not mix multiple access stories unless the product flow clearly supports
them.

## Paid Launch Setup

If the community collects money, the builder should be able to explain the
offer in one sentence:

Members pay for access to `people + community knowledge + the community agent + ongoing value`.

Before sharing a paid join page:

1. confirm the paid member promise is concrete
2. configure the paid access path
3. confirm checkout can create backend entitlement
4. confirm payout readiness is visible and provider setup is not blocked
5. confirm the public copy matches the actual member experience

Do not launch paid access if the community cannot explain what members get
after checkout.

## Launch Test

Before sharing the join page, test:

1. signed-out join page view
2. sign-in from the join page
3. join or checkout path
4. approval path if enabled
5. member can enter the community
6. member can read and post in chat
7. member can view resources
8. member can talk with the community agent on the Agent page
9. an @mention of the agent gets a reply without builder authority
10. paid access creates entitlement after provider verification
11. payout readiness is clear for the builder

## Rules

1. Published communities can still be gated.
2. The join page is the canonical public entry surface.
3. Membership is required for the real community surface.
4. Payment redirects do not grant access until verified.
5. Keep the initial setup narrow and useful.
6. Do not describe an unlisted community as a separate private visibility state.
7. Keep branding and public copy aligned with what the community actually offers.
8. If charging money, make the paid outcome obvious before checkout.

## Common Mistakes

- Treating the join page as the member area.
- Assuming published means open access.
- Publishing before testing the actual join flow.
- Configuring paid access before the builder understands the member value.
- Overwriting owner-controlled identity and publishing decisions through delegated roles.

## Related Concepts

- `community`
- `join-page`
- `community-site`
- `entitlement`
- `role`
- `billing-entitlements`
