---
id: product.guide.builder_quickstart
title: Builder Quickstart
audience: builder, llm
status: alpha-current
last_verified: 2026-08-02
---

# Builder Quickstart

## Goal

Launch a community intelligence system that members can join, use, and pay for where appropriate.

The first version should be simple: one clear community, one useful agent, one believable access model, and enough shared knowledge for members to get value quickly.

Each managed community uses its own $79 monthly founder plan to run Polynet-hosted AI. Exact grandfathered communities may instead activate owner BYOK. There is no personal Premium plan or paid tool tier.

## Before You Start

You need a clear answer to four questions:

1. Who is this community for?
2. What problem should the community help them solve?
3. What should the agent be good at?
4. What access model should members understand immediately?

If those answers are vague, more settings will not fix the product.

## Core Steps

1. Create the community as an unlisted draft.
2. Fund that community through its $79 monthly founder plan.
3. Define the community purpose and public profile.
4. Configure the community agent.
5. Add resources that represent durable community knowledge.
6. Attach skills where repeatable agent behavior is needed.
7. Configure member access, billing, and roles.
8. Verify the official Polynet MCP handoff for external harness users.
9. Publish and share the community funnel.
10. Improve the system based on member participation and useful signal.

## Builder Mental Model

You are not just creating a chat room. You are packaging expertise, workflows, and community context into an AI-native product.

The community is the container. The agent is the active product surface.
Resources are durable knowledge. Skills are repeatable behavior. The official
Polynet MCP exposes authorized Polynet context to external harnesses.
Entitlements decide access.

## Revenue Mental Model

Members should understand what they are paying for before they pay. A paid Polynet community should make the value legible:

- the problem the community helps solve
- the agent capability members can use
- the resources or workflows members get access to
- the people or expert context members join
- the expected ongoing value of participating

The cash path is simple: configure the community, define the paid access model, connect payout readiness, share the funnel, let members check out, and grant access only after backend entitlement exists.

## Recommended Build Order

1. Start with the community purpose.
2. Write the simplest public explanation of the community.
3. Configure the agent for one primary job.
4. Add a small number of high-signal resources.
5. Add only the skills needed for repeated workflows.
6. Configure access, billing, and roles.
7. Verify payout readiness if the community collects money.
8. Test as a member before inviting people.
9. Verify the Polynet MCP setup packet and OAuth handoff.
10. Share the funnel link.

## Current Alpha Boundaries

- Visibility is `Published` or `Unlisted`.
- The funnel is the canonical public entry surface.
- Published does not mean ungated.
- Membership and entitlement are backend authority.
- Paid community access requires verified backend entitlement.
- Builder payouts depend on payout provider readiness.
- Existing approved founders can continue managing their owned communities.
- Each managed community requires its own verified $79 monthly funding subscription to run Polynet-hosted AI.
- A paying founder may own an unlimited number of communities. There is no
  account-level numeric cap, but every existing community must have current
  funding before the next unlisted checkout draft can be created.
- The canonical create flow begins as an unlisted managed draft and continues directly to founder checkout, but AI funding does not control visibility.
- An unpaid managed community can be configured, published, listed in Discover, accept public joins, and collect paid-member revenue. Only its community-funded AI remains disabled.
- Authenticated tool access is not sold as a separate plan. Polynet absorbs supported provider cost while enforcing rate limits, provider quotas, and cost receipts.
- Paid-member community revenue always carries Polynet's 2.9% application fee, independent of founder funding mode.
- Owner/admin manage resources and most operational settings.
- Moderators help with moderation and join request review, not paid access.
- Polynet does not mount third-party MCP servers in member or community
  harnesses.
- Skills are package attachments and should be injected intentionally.

## Rules

1. Start with one useful community loop before adding complexity.
2. Keep the agent's job concrete.
3. Use resources for durable knowledge.
4. Use skills for repeatable behavior.
5. Keep access and billing simple enough for members to understand.
6. Do not use prompts as the only place where important product truth lives.
7. Do not add integrations before the core community loop works.
8. Do not invite members before testing join, access, chat, resources, and the
   member personal agent under community context.

## Common Mistakes

- Launching with a vague agent job.
- Adding many resources before curating the first useful few.
- Expanding integrations before the core community loop is useful.
- Treating a successful checkout redirect as membership before backend verification.
- Giving admins or moderators more authority than they need.
- Letting the public funnel say more than the product can currently do.

## Related Concepts

- `community`
- `agent`
- `funnel`
- `resource`
- `skill`
- `polynet-mcp`
- `entitlement`
