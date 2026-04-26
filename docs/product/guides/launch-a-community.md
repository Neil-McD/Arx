---
id: product.guide.launch_community
title: Launch a Community
audience: builder, llm
status: alpha-current
last_verified: 2026-04-26
---

# Launch a Community

## Goal

Create a community that can be discovered, shared through a funnel, joined by members, and used as an agent context.

The goal is not to configure every possible setting. The goal is to create one coherent community entry path and one coherent member experience.

## Setup Checklist

1. Name the community.
2. Set the slug and profile copy.
3. Upload or configure brand assets.
4. Choose visibility: Published or Unlisted.
5. Configure entry policy and access.
6. Configure billing if the community is paid.
7. Configure roles for trusted operators.
8. Add resources and agent instructions.
9. Share the funnel link.

## Community Identity

The community identity should answer:

- what the community is called
- who it is for
- what problem it solves
- why the agent and community are useful together

Keep the profile copy concrete. Avoid vague claims like "collaborate better" unless the specific workflow is obvious.

## Visibility

Polynet uses two visibility states:

- `Published`: discoverable or publicly viewable according to product surface rules
- `Unlisted`: distributed primarily by direct link

Visibility is not access. A published community can still require membership, approval, payment, or entitlement.

## Funnel

The funnel is the shareable public entry surface.

Use it for:

- YouTube descriptions
- social posts
- email
- direct messages
- paid acquisition
- community invites

The funnel can explain the community and route the user into sign-in, join, approval, or checkout. It does not grant the real community surface by itself.

## Access Setup

Access should be understandable before launch:

- free join
- approval-gated join
- paid subscription
- manual or internal grant where supported

Do not mix multiple access stories unless the product flow clearly supports them.

## Launch Test

Before sharing the funnel, test:

1. signed-out funnel view
2. sign-in from funnel
3. join or checkout path
4. approval path if enabled
5. member can enter community
6. member can read/post chat
7. member can view resources
8. member can use the community lens in workspace

## Rules

1. Published communities can still be gated.
2. The funnel is the canonical public entry surface.
3. Membership is required for the real community surface.
4. Payment redirects do not grant access until verified.
5. Keep the initial setup narrow and useful.
6. Do not describe an unlisted community as a separate private visibility state.
7. Keep branding and public copy aligned with what the community actually offers.

## Common Mistakes

- Treating the funnel as the member area.
- Assuming published means open access.
- Publishing before testing the actual join flow.
- Configuring paid access before the builder understands the member value.
- Overwriting owner-controlled identity and publishing decisions through delegated roles.

## Related Concepts

- `community`
- `funnel`
- `entitlement`
- `role`
- `billing-entitlements`
