---
id: product.reference.security_privacy
title: Security and Privacy
audience: builder, member, llm, operator
status: alpha-current
last_verified: 2026-04-26
---

# Security and Privacy

## Core Rules

1. Cloud state is canonical for users, communities, memberships, entitlements, billing state, threads/messages, and memory records.
2. Backend checks are authoritative for protected actions.
3. Access should fail closed.
4. Private member AI usage should not be silently transformed into shared collective intelligence.
5. The web runtime cannot execute local filesystem or shell tools.
6. Tool execution must be scoped and bounded.
7. Prompt context should not leak private community or user data across access boundaries.

## Privacy Model

Shared community activity and curated resources can become part of the community intelligence layer.

Private user context should remain private unless explicitly shared or transformed through an intentional product flow.

## Related Concepts

- `entitlement`
- `role`
- `memory`
- `context-model`

