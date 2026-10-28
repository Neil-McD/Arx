---
id: product.community
title: Community
audience: builder, member, llm
status: alpha-current
last_verified: 2026-10-28
---

# Community

## Definition

A community is the gated product container where a builder brings together members, the community agent, chat, resources, events, access rules, roles, billing, and shared context.

A community is both a product surface and a distribution surface.

## Why It Exists

The community gives the agent product distribution, trust, feedback, retention, and a place for shared knowledge to accumulate.

The community gives members a reason to return, participate, ask questions, share resources, and build context that can become reusable leverage for the network.

## User Mental Model

For builders, a community is the business surface.

For members, a community is the place they join to access people, resources, and agent capability around a specific problem or domain.

The join page (or the community's site) is the front door. The real community surface is the member area.

## System Mental Model

A community is identified by durable backend state. It has visibility, membership, roles, entitlements, resources, settings, and optional billing configuration.

Manager-facing General settings load as one authorized backend snapshot. Saves are atomic across community identity, branding, visibility, and pricing, and use a settings revision to reject stale writers before any part of the snapshot changes. Cancel restores the complete locally saved snapshot without a network read; a stale-write conflict preserves the draft until the manager explicitly reloads current settings.

Community access is not determined by the URL alone. The backend evaluates membership, entitlement, role, blocks, approval state, and billing-derived access where relevant.

## Alpha-Current Behavior

The MVP community surface includes:

- Published and Unlisted visibility
- a join page (`/c/<slug>`) as the canonical entry surface
- join, approval, checkout, and membership flows
- member roles: owner, admin, moderator, member
- community chat
- community resources
- community members and join request review
- community settings and branding
- billing and access configuration
- one community agent: private member conversations on the Agent page, @mention
  replies, and community cognition
- accepted community memory

## Rules

1. Published does not mean ungated.
2. Unlisted means harder to discover, not automatically private from anyone with a valid link.
3. The join page is the canonical public entry surface.
4. The real community surface requires entitlement and membership checks.
5. Community-owned context must not override platform security rules.
6. Role controls authority; entitlement controls access.
7. Community access should fail closed when membership or entitlement evidence is missing.
8. Community docs, instructions, resources, and memory remain scoped to the community.
9. Community settings conflicts must fail closed; a stale browser must reload current settings instead of overwriting newer values.

## Examples

- A paid founder community with an agent trained on the founder's methodology.
- A free community where members chat, share resources, and ask the community
  agent for help.
- An unlisted, gated community distributed through a direct join page link.

## Non-Goals

A community is not just a message board and not just a billing group. It is the product container for a community intelligence system.

A community is not a way to bypass platform access, runtime tool policy,
billing verification, or privacy boundaries.

## Common Mistakes

- Assuming a published community is open to everyone.
- Treating a join request as membership.
- Treating payment redirect success as access.
- Treating moderator role as full management authority.
- Treating raw activity or members' private agent conversations as accepted
  community memory.

## Related Concepts

- `agent`
- `join-page`
- `community-site`
- `resource`
- `role`
- `entitlement`
- `community-lens`
