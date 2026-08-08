---
id: product.guide.manage_access_billing_and_roles
title: Manage Access, Billing, and Roles
audience: builder, llm, operator
status: alpha-current
last_verified: 2026-08-08
---

# Manage Access, Billing, and Roles

## Goal

Control who can access a community, who can manage it, and how payment maps to entitlement.

## Mental Model

Access, billing, and roles are related but separate:

- entitlement says whether someone can access something
- billing says whether payment state supports commercial access
- role says what authority someone has inside the community

Keep those concepts separate. Most serious permission bugs come from blending them together.

## Access Model

Community access can come from membership, approval, payment-derived entitlement, manual grant, or owner authority depending on the flow.

The frontend can show gates, buttons, and status. The backend is authority.

Published communities can still require entitlement. Unlisted communities can still be joined through a direct funnel link if the entry flow allows it.

## Billing Model

Billing creates or supports entitlement only after provider-backed verification.

Redirects are UX. Checkout finalization and webhook/provider verification are the source of truth. If a payment state is uncertain, access should fail closed or show a clear pending state rather than pretending the user is entitled.

When a paid community member is removed or banned, paid access should be ended through the appropriate backend/provider path.

## Collecting Cash

For a builder, the revenue path should be understandable:

1. Define what members are paying for: the agent, community, resources, workflow, expertise, or access to a specialized system.
2. Configure the community and paid access model.
3. Connect payout readiness through the supported provider path.
4. Share the funnel link where prospects already are.
5. The member signs in, checks out, and receives access only after backend verification.
6. The builder can see whether revenue collection and payouts are ready, pending, or blocked.

The value proposition should be direct: builders are not just charging for a chat room. They are charging for access to a community intelligence system that combines expertise, people, resources, and an agent surface.

## Payout Model

Payout readiness belongs to the builder and provider account. Member access belongs to entitlement. Community authority belongs to role.

Keep those separate:

- a connected payout account does not make a member entitled
- a paid member does not become an admin
- an admin does not own payout identity unless policy explicitly grants it
- a payout issue should not silently create or remove member entitlement

## Role Model

Owner:

- controls identity, branding, publishing, deletion, payouts, and ownership-sensitive settings

Admin:

- helps operate the community
- can manage members, resources, and pricing where policy allows
- should not rename, rebrand, delete, or unpublish the community

Moderator:

- can help moderate content and review join requests
- should not remove/ban active members or touch paid access
- should not manage resources in the current policy

Member:

- participates in the community
- uses allowed chat, resources, voice, and personal-agent community
  context

## Launch Checklist

Before launch, verify:

1. owner can manage community identity and publishing
2. admin can perform intended operational work
3. moderator can review join requests but cannot touch paid access
4. member can enter only after entitlement exists
5. removed member cannot immediately bypass the rejoin policy
6. banned user cannot rejoin
7. paid access is ended when removal/ban policy requires it
8. paid community checkout reaches backend entitlement
9. payout readiness is visible to the builder
10. member-facing funnel copy matches the paid value actually delivered

## Rules

1. Do not use frontend state as access authority.
2. Do not treat payment redirects as final proof.
3. Do not treat role as payment status.
4. Do not treat payment status as management authority.
5. Owners should retain control over identity, brand, deletion, and publishing.
6. Admins can help operate the community where policy allows.
7. Moderators should only have limited moderation authority.
8. Access should be evaluated per request.
9. Protected writes must be role-checked on the backend.
10. Access should fail closed when entitlement evidence is missing.
11. Payout readiness should be explicit before builders rely on paid access.
12. Community monetization should explain the direct member value, not just the price.

## Common Mistakes

- Letting a UI badge decide access.
- Treating an approved join request as payment.
- Treating a paid subscription as admin authority.
- Letting moderators mutate active paid access.
- Letting admins control owner-only identity or publishing settings.
- Forgetting to end provider subscriptions when access is revoked.

## Related Concepts

- `entitlement`
- `role`
- `access-model`
- `billing-entitlements`
- `roles-permissions`
