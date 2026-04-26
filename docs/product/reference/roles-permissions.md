---
id: product.reference.roles_permissions
title: Roles and Permissions
audience: builder, llm, operator
status: alpha-current
last_verified: 2026-04-26
---

# Roles and Permissions

## Role Model

Owner:

- highest community authority
- controls identity, branding, publishing, deletion, and ownership-sensitive settings

Admin:

- helps operate the community
- can manage operational settings where policy allows
- should not rename, rebrand, delete, or unpublish the community

Moderator:

- handles limited moderation flows
- should not control paid access
- should not remove or ban active members unless explicitly promoted by policy

Member:

- participates in the community
- uses resources, chat, and allowed agent surfaces

## Rules

1. Protected writes must check role on the backend.
2. Owner-only actions should stay owner-only.
3. Admin authority should be useful but bounded.
4. Moderator authority should be narrow.
5. UI should reflect the same permissions the backend enforces.

## Related Concepts

- `role`
- `access-model`
- `security-privacy`

