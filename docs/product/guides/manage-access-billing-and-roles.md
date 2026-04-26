---
id: product.guide.manage_access_billing_and_roles
title: Manage Access, Billing, and Roles
audience: builder, llm, operator
status: alpha-current
last_verified: 2026-04-26
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
- uses allowed chat, resources, voice, and workspace lens surfaces

## Launch Checklist

Before launch, verify:

1. owner can manage community identity and publishing
2. admin can perform intended operational work
3. moderator can review join requests but cannot touch paid access
4. member can enter only after entitlement exists
5. removed member cannot immediately bypass the rejoin policy
6. banned user cannot rejoin
7. paid access is ended when removal/ban policy requires it

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
