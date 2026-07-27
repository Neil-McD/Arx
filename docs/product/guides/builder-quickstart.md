---
id: product.guide.builder_quickstart
title: Builder Quickstart
audience: builder, llm
status: alpha-current
last_verified: 2026-07-27
---

# Builder Quickstart

## Goal

Launch a community intelligence system that members can join, use, and pay for where appropriate.

The first version should be simple: one clear community, one useful agent, one believable access model, and enough shared knowledge for members to get value quickly.

Every authenticated free user can build one community. Polynet Premium unlocks a second community, Codex and future premium runtimes, web research, hosted workspace tools, and premium tool usage.

## Before You Start

You need a clear answer to four questions:

1. Who is this community for?
2. What problem should the community help them solve?
3. What should the agent be good at?
4. What access model should members understand immediately?

If those answers are vague, more settings will not fix the product.

## Core Steps

1. Create or configure a community.
2. Define the community purpose and public profile.
3. Configure the community agent.
4. Add resources that represent durable community knowledge.
5. Connect apps/MCPs where they provide real capability.
6. Attach skills where repeatable agent behavior is needed.
7. Configure access, billing, and roles.
8. Share the community funnel.
9. Improve the system based on member participation and useful signal.

## Builder Mental Model

You are not just creating a chat room. You are packaging expertise, workflows, and community context into an AI-native product.

The community is the container. The agent is the active product surface. Resources are durable knowledge. Skills are repeatable behavior. Apps/MCPs are external capability. Entitlements decide access.

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
6. Connect only apps/MCPs that unlock real capability.
7. Configure access, billing, and roles.
8. Verify payout readiness if the community collects money.
9. Test as a member before inviting people.
10. Share the funnel link.

## Current Alpha Boundaries

- Visibility is `Published` or `Unlisted`.
- The funnel is the canonical public entry surface.
- Published does not mean ungated.
- Membership and entitlement are backend authority.
- Paid community access requires verified backend entitlement.
- Builder payouts depend on payout provider readiness.
- Free accounts can own one community.
- Polynet Premium accounts can own two communities.
- Existing owned communities remain active if limits change; the limit only gates creating another community.
- Premium unlocks paid tools such as hosted workspace tools, web research, and premium runtimes.
- Owner/admin manage resources and most operational settings.
- Moderators help with moderation and join request review, not paid access.
- Remote MCP apps must be validated before mounted capability should be trusted.
- Skills are package attachments and should be injected intentionally.

## Rules

1. Start with one useful community loop before adding complexity.
2. Keep the agent's job concrete.
3. Use resources for durable knowledge.
4. Use skills for repeatable behavior.
5. Use apps/MCPs only when they unlock real capability.
6. Keep access and billing simple enough for members to understand.
7. Do not use prompts as the only place where important product truth lives.
8. Do not add integrations before the core community loop works.
9. Do not invite members before testing join, access, chat, resources, and member-agent community context.

## Common Mistakes

- Launching with a vague agent job.
- Adding many resources before curating the first useful few.
- Connecting apps because they are impressive instead of useful.
- Treating a successful checkout redirect as membership before backend verification.
- Giving admins or moderators more authority than they need.
- Letting the public funnel say more than the product can currently do.

## Related Concepts

- `community`
- `agent`
- `funnel`
- `resource`
- `skill`
- `app-mcp`
- `entitlement`
