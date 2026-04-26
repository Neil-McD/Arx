---
id: product.guide.create_and_use_skills
title: Create and Use Skills
audience: builder, llm
status: alpha-current
last_verified: 2026-04-26
---

# Create and Use Skills

## Goal

Package repeatable agent behavior in a reusable and inspectable form.

Skills should make repeated workflows easier without turning every community agent prompt into an unreadable blob.

## Mental Model

A skill is a behavior package.

It is different from:

- a resource, which stores durable knowledge
- an app/MCP, which provides external capability
- a prompt, which composes instructions for a turn
- an entitlement, which decides access

## Good Skill Shape

A good skill has:

- name
- purpose
- when to use it
- required inputs
- behavior rules
- output expectations
- limits

## Current Alpha Behavior

Skills are real package attachments. They should be attached intentionally and injected on demand, not broadly dumped into every turn.

Community owners/admins can attach skills to a community where the product surface allows it. Members use the resulting agent behavior through the community lens and relevant runtime flow.

## When To Create A Skill

Create a skill when the community repeatedly needs the same behavior:

- produce a standard analysis format
- follow a founder's method
- triage a class of problems
- generate a recurring artifact
- ask a repeatable set of clarifying questions

Do not create a skill for one-off facts. Use resources for durable knowledge.

## Skill Design Checklist

1. Give the skill a specific name.
2. Define when it should be used.
3. Define what inputs it needs.
4. Define what output it should produce.
5. Define what it must not do.
6. Link to relevant resources if needed.
7. Keep it scoped enough that the agent can choose it intentionally.

## Rules

1. Use skills for repeated workflows.
2. Use resources for durable knowledge.
3. Use apps/MCPs for external tools and data.
4. Avoid making skills vague prompt dumps.
5. Do not let skills bypass platform or community access rules.
6. Skills should be separate from app login and connection state.
7. Skills should be selected intentionally, not implicitly applied to every turn.
8. Skills should not grant tools by themselves.

## Common Mistakes

- Using skills as a place to store long reference documents.
- Creating broad skills that apply to everything.
- Treating a skill as permission to use a tool.
- Attaching too many skills before the community has a clear workflow.
- Hiding product or access policy inside a skill.

## Related Concepts

- `skill`
- `agent`
- `resource`
- `app-mcp`
