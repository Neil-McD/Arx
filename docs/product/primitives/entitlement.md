---
id: product.entitlement
title: Entitlement
audience: builder, member, llm, operator
status: alpha-current
last_verified: 2026-04-26
---

# Entitlement

## Definition

An entitlement is durable backend truth that says a user has access to a product, community, capability, or plan.

## Why It Exists

Entitlements keep access decisions reliable, secure, and independent from frontend assumptions.

## User Mental Model

If a user has the right plan, membership, purchase, or grant, they can access the thing. If not, they should see a clear gate.

## System Mental Model

Entitlement checks happen on the backend. Frontend UI is projection, not authority.

## Rules

1. Access decisions are entitlement-driven.
2. Redirects are UX only.
3. Payment provider/webhook verification is authoritative.
4. Published communities can still require entitlement.
5. Roles and entitlements are separate concepts.

## Related Concepts

- `role`
- `community`
- `billing-entitlements`
- `access-model`

