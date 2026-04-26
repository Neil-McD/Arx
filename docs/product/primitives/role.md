---
id: product.role
title: Role
audience: builder, member, llm
status: alpha-current
last_verified: 2026-04-26
---

# Role

## Definition

A role is a community authority level that controls what a person can manage or moderate inside a community.

## Why It Exists

Roles let communities delegate operational work without giving every member owner-level power.

## User Mental Model

Owners control the community. Admins help run it. Moderators help with limited moderation. Members participate.

## System Mental Model

Role controls authority. Entitlement controls access. Payment state controls commercial access. These are related but not the same.

## Rules

1. Owner authority should remain highest and hardest to delegate.
2. Admin authority can manage operational settings where allowed.
3. Moderator authority should be limited to moderation flows.
4. Member authority should not include management actions.
5. Role checks must happen on the backend for protected actions.

## Related Concepts

- `community`
- `entitlement`
- `roles-permissions`
- `access-model`

