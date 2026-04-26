---
id: product.guide.configure_community_agent
title: Configure a Community Agent
audience: builder, llm
status: alpha-current
last_verified: 2026-04-26
---

# Configure a Community Agent

## Goal

Shape how the community agent behaves without hiding product truth in one giant prompt.

The best community agent starts with a clear job, a small set of durable resources, and repeatable skills for the workflows that actually recur.

## Inputs

- community purpose
- builder methodology
- audience and member needs
- resources
- skills
- connected apps/MCPs
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
- community-specific behavior belongs in community agent instructions
- reusable knowledge belongs in resources
- repeatable workflows belong in skills
- external capability belongs in apps/MCPs
- access and safety boundaries belong in backend policy

## Prompt Boundary

Community instructions sit below platform rules, access rules, and runtime policy.

Do not put secrets, billing assumptions, private member data, or access decisions into prompts. The agent can follow community behavior rules, but it cannot grant membership, invent payment state, or bypass entitlement checks.

## Good Agent Configuration

A good configuration includes:

- who the agent helps
- what domain it is focused on
- what it should ask before acting
- what resources it should prefer
- what skills it can use
- what it should not do
- how it should respond when it lacks access, tools, or evidence

## Rules

1. Keep the agent job concrete.
2. Put stable product truth in docs, not prompts.
3. Put reusable knowledge in resources.
4. Put repeatable behavior in skills.
5. Keep owner instructions below platform safety and access rules.
6. Do not ask the agent to use community context for users who lack access.
7. Do not claim an app or MCP tool is available unless it is connected, validated, mounted, and allowed.
8. Keep skills separate from app login or connection state.
9. Prefer references to docs/resources over copying large blobs into prompts.

## Common Mistakes

- Creating one giant prompt instead of using docs, resources, and skills.
- Asking the agent to make access decisions from text instructions.
- Treating an app catalog entry as mounted runtime capability.
- Dumping every skill into every turn.
- Making the agent sound impressive before making it useful.

## Related Concepts

- `agent`
- `skill`
- `resource`
- `app-mcp`
- `prompt-context-model`
