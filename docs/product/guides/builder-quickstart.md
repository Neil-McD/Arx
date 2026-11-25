---
id: product.guide.builder_quickstart
title: Builder Quickstart
audience: builder, llm
status: alpha-current
last_verified: 2026-11-25
---

# Builder Quickstart

## Goal

Launch a community intelligence system that members can join, use, and pay for where appropriate.

The first version should be simple: one clear community, one useful agent job, one believable access model, and enough shared knowledge for members to get value quickly.

Creating and running a community is free (up to 10 unfunded live communities per owner, unlimited members). When you want Polynet-hosted AI for a community, choose **Guide** ($20/month with $3/month AI included for reactive 1:1 chats, `@mentions`, active-thread follow-ups, and living memory) or **Chief of Staff** ($100/month with $20/month AI included plus Daily Briefs, proactive Member & Builder Check-Ins, unanswered-question auto-replies, and optional usage boosts). Without a paid AI plan, the community runs as usual and only hosted AI is off. There is no account-wide plan, community BYOK option, personal Premium plan, or paid tool tier.

## Before You Start

You need a clear answer to four questions:

1. Who is this community for?
2. What problem should the community help them solve?
3. What should the community agent be good at?
4. What access model should members understand immediately?

If those answers are vague, more settings will not fix the product.

## Core Steps

1. Finish account setup, then choose Create Community and name your community, its purpose and public profile. No payment is needed.
2. Turn on hosted AI with **Guide** ($20/month) or **Chief of Staff** ($100/month) from the community's Guide settings whenever you're ready.
3. Keep shaping the community; an AI plan can be added or upgraded at any time.
4. Write the community agent's instructions.
5. Add resources that represent durable community knowledge.
6. Configure member access, billing, and roles.
7. Optionally connect your own AI harness through the official Polynet MCP.
8. Publish and share the community's join page link.
9. Improve the community based on member participation and useful signal.

## Builder Mental Model

You are not just creating a chat room. You are packaging expertise, people, and community knowledge into an AI-native product.

The community is the container. The community agent is the one AI that serves
every member, inside each member's permissions. Resources are durable
knowledge. Accepted memory is what the community has learned. The official
Polynet MCP lets you work on your community from your own AI harness.
Entitlements decide access.

## Revenue Mental Model

Members should understand what they are paying for before they pay. A paid Polynet community should make the value legible:

- the problem the community helps solve
- what the community agent can help members do
- the resources and events members get access to
- the people or expert context members join
- the expected ongoing value of participating

The cash path is simple: configure the community, define the paid access model, connect payout readiness, share the join page link, let members check out, and grant access only after backend entitlement exists.

## Recommended Build Order

1. Start with the community purpose.
2. Write the simplest public explanation of the community.
3. Give the agent one primary job in its instructions.
4. Add a small number of high-signal resources.
5. Configure access, billing, and roles.
6. Verify payout readiness if the community collects money.
7. Test as a member before inviting people.
8. Share the join page link.

## Current Alpha Boundaries

- Visibility is `Published` or `Unlisted`.
- The join page (`/c/<slug>`) is the canonical public entry surface. It is generated from community settings; there is no funnel editor.
- Published does not mean ungated.
- Membership and entitlement are backend authority.
- Paid community access requires verified backend entitlement.
- Builder payouts depend on payout provider readiness.
- Every community operates free; hosted AI requires a per-community Guide ($20/month) or Chief of Staff ($100/month) plan.
- An owner may have up to 10 live free communities (archived ones don't count); funded communities are never capped.
- Create Community goes straight to setup, and each community manages its AI plan directly from Settings → Guide.
- A community without a paid AI plan can be configured, published, listed in Discover, accept public joins, send zero-AI weekly digests, and collect paid-member revenue. Only hosted AI is off.
- Authenticated tool access is not sold as a separate plan. Polynet absorbs supported provider cost while enforcing rate limits, provider quotas, and cost receipts.
- Paid-member community revenue always carries Polynet's 2.9% application fee, independent of Builder funding mode.
- Owner/admin manage resources and most operational settings.
- Moderators help with moderation and join request review, not paid access.
- Everyone can connect their own AI through the official Polynet MCP, in the
  lens of their role: members as members, moderators with join review and post
  removal, owners and admins as builders.
- Polynet does not mount third-party MCP servers or app integrations into
  the community agent.

## Rules

1. Start with one useful community loop before adding complexity.
2. Keep the agent's job concrete.
3. Use resources for durable knowledge.
4. Keep access and billing simple enough for members to understand.
5. Do not use prompts as the only place where important product truth lives.
6. Do not invite members before testing join, access, chat, resources, and the
   Agent page as a member.

## Common Mistakes

- Launching with a vague agent job.
- Adding many resources before curating the first useful few.
- Treating a successful checkout redirect as membership before backend verification.
- Giving admins or moderators more authority than they need.
- Letting public copy promise more than the product can currently do.

## Related Concepts

- `community`
- `agent`
- `join-page`
- `resource`
- `polynet-mcp`
- `entitlement`
