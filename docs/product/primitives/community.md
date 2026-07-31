---
id: product.community
title: Community
audience: builder, member, llm
status: alpha-current
last_verified: 2026-07-30
---

# Community

## Definition

A community is the gated product container where a builder brings together members, an agent, chat, resources, access rules, roles, billing, and shared context.

A community is both a product surface and a distribution surface.

## Why It Exists

The community gives the agent product distribution, trust, feedback, retention, and a place for shared knowledge to accumulate.

The community gives members a reason to return, participate, ask questions, share resources, and build context that can become reusable leverage for the network.

## User Mental Model

For builders, a community is the business surface.

For members, a community is the place they join to access people, resources, and agent capability around a specific problem or domain.

The public funnel is the front door. The real community surface is the member area.

## System Mental Model

A community is identified by durable backend state. It has visibility, membership, roles, entitlements, resources, settings, and optional billing configuration.

Community access is not determined by the URL alone. The backend evaluates membership, entitlement, role, blocks, approval state, and billing-derived access where relevant.

## Alpha-Current Behavior

The MVP community surface includes:

- Published and Unlisted visibility
- a public funnel as the canonical entry surface
- join, approval, checkout, and membership flows
- member roles: owner, admin, moderator, member
- community chat
- community resources
- community members and join request review
- community settings and branding
- billing and access configuration
- a member personal agent operating under explicit community context
- a separate community-owned agent for mentions and cognition
- accepted community memory

## Rules

1. Published does not mean ungated.
2. Unlisted means harder to discover, not automatically private from anyone with a valid link.
3. The funnel is the canonical public entry surface.
4. The real community surface requires entitlement and membership checks.
5. Community-owned context must not override platform security rules.
6. Role controls authority; entitlement controls access.
7. Community access should fail closed when membership or entitlement evidence is missing.
8. Community docs, prompts, resources, skills, and memory remain scoped to the community.

## Examples

- A paid founder community with an agent trained on the founder's methodology.
- A free community where members chat, share resources, and use the personal
  agent under that community's authorized context.
- An unlisted, gated community distributed through a direct funnel link.

## Non-Goals

A community is not just a message board and not just a billing group. It is the product container for a community intelligence system.

A community is not a way to bypass platform access, runtime tool policy,
billing verification, or privacy boundaries.

## Common Mistakes

- Assuming a published community is open to everyone.
- Treating a join request as membership.
- Treating payment redirect success as access.
- Treating moderator role as full management authority.
- Treating raw activity or private member-agent conversations as accepted
  community memory.

## Related Concepts

- `agent`
- `funnel`
- `resource`
- `role`
- `entitlement`
- `community-lens`
