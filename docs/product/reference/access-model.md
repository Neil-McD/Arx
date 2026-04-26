---
id: product.reference.access_model
title: Access Model
audience: builder, member, llm, operator
status: alpha-current
last_verified: 2026-04-26
---

# Access Model

## Definition

The access model decides who can view, join, use, manage, or monetize a community and its related capabilities.

## Core Concepts

- Visibility: whether a community is Published or Unlisted.
- Membership: whether a user belongs to the community.
- Entitlement: whether backend state grants access to a capability or product.
- Role: what authority a user has inside the community.
- Billing state: whether payment/provider state supports paid access.

## Rules

1. Visibility is not entitlement.
2. Membership is not management authority.
3. Role is not payment state.
4. Billing redirect is not proof of access.
5. Backend checks are authoritative.
6. Frontend state is projection only.
7. Access should fail closed when evidence is missing.

## Related Concepts

- `entitlement`
- `role`
- `billing-entitlements`

