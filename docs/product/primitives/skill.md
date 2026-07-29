---
id: product.skill
title: Skill
audience: builder, llm
status: alpha-current
last_verified: 2026-04-26
---

# Skill

## Definition

A skill is a reusable instruction or capability package that can shape how an agent behaves for a task, domain, or workflow.

## Why It Exists

Skills let builders package repeatable behavior without burying everything inside one long prompt.

## User Mental Model

A skill is a named capability the builder can attach or select for a community agent.

## System Mental Model

Skills should be separate from tool authority and raw prompt blobs. They should
be selected intentionally and injected only when relevant.

## Rules

1. Skills should be explicit and inspectable.
2. Skills should not bypass platform or community access rules.
3. Skills should not be implicitly dumped into every turn.
4. Skills are different from executable tools and external harness access.
5. Skills should be documented with purpose, inputs, expected behavior, and limits.

## Related Concepts

- `agent`
- `polynet-mcp`
- `resource`
- `prompt-context-model`
