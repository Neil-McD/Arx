---
id: product.reference.billing_entitlements
title: Billing and Entitlements
audience: builder, member, llm, operator
status: alpha-current
last_verified: 2026-04-26
---

# Billing and Entitlements

## Definition

Billing is the payment system. Entitlements are the access truth derived from verified payment, grants, membership, or plan state.

## Rules

1. Payment redirects are not authoritative.
2. Provider/webhook verification is authoritative.
3. Checkout finalization should be idempotent.
4. Community access should be evaluated per request.
5. Builder payouts must remain consistent with verified community revenue state.
6. Access should fail closed if billing evidence is missing or inconsistent.

## Common Mistakes

- treating a successful redirect as membership
- treating role as paid access
- treating paid access as management authority
- showing frontend access before backend entitlement exists

## Related Concepts

- `entitlement`
- `access-model`
- `role`

