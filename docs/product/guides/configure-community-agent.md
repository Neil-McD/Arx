---
id: product.guide.configure_community_agent
title: Configure the Community Agent
audience: builder, llm
status: alpha-current
last_verified: 2026-10-28
---

# Configure the Community Agent

## Goal

Shape how your community's one agent behaves without hiding product truth in
one giant prompt.

The best community agent starts with a clear job, short community instructions,
and a small set of durable resources.

## Where To Configure It

Owners and admins edit the agent's community instructions in Community
Settings → Agent. These instructions add to the platform's locked identity,
security, and authority rules; they never replace them.

## Inputs

- community purpose
- builder methodology
- audience and member needs
- resources
- access and safety boundaries

## Agent Job

Define the agent's job in one sentence:

`Help [member type] do [specific work] using [community method/context].`

Good agent jobs are specific:

- help members apply a distribution workflow
- help operators triage implementation questions
- help founders reason through community monetization
- help members use the community's resources to make a decision

Weak agent jobs are vague:

- answer anything
- help people collaborate
- be smart
- improve engagement

## Configuration Layers

Use the right layer for the right kind of information:

- stable product truth belongs in product docs
- community-specific behavior belongs in the community instructions
- reusable knowledge belongs in resources
- learned community knowledge becomes accepted memory over time
- tool capability belongs to runtime policy
- access and safety boundaries belong to backend policy

## Prompt Boundary

Community instructions sit below platform rules, access rules, and runtime
policy.

Do not put secrets, billing assumptions, private member data, or access
decisions into instructions. The agent can follow community behavior rules,
but it cannot grant membership, invent payment state, or bypass entitlement
checks.

## Good Agent Instructions

Good instructions cover:

- who the agent helps
- what domain it focuses on
- what it should ask before acting
- what resources it should prefer
- what it should not do
- how it should respond when it lacks access, tools, or evidence

## Rules

1. Keep the agent job concrete.
2. Put stable product truth in docs, not instructions.
3. Put reusable knowledge in resources.
4. Keep community instructions below platform safety and access rules.
5. Do not ask the agent to use community context for users who lack access.
6. Do not claim a tool is available unless the runtime exposes and allows it.
7. Prefer pointing to resources over copying large blobs into instructions.

## Common Mistakes

- Writing one giant prompt instead of using docs and resources.
- Asking the agent to make access decisions from text instructions.
- Treating descriptive configuration as runtime capability.
- Making the agent sound impressive before making it useful.

## Related Concepts

- `agent`
- `resource`
- `memory`
- `prompt-context-model`
