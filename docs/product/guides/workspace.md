---
id: product.guide.workspace
title: Workspace
audience: member, builder, llm
status: alpha-current
last_verified: 2026-04-26
---

# Workspace

## Goal

Use persistent AI threads across communities and contexts.

## Mental Model

The workspace is where you work with the agent. A thread contains the conversation. A lens controls which community context should guide future turns.

## Rules

1. A thread can continue across sessions.
2. A thread can switch community lens.
3. The lens must be validated by the backend.
4. Long threads may require summarization or memory to stay fast and useful.
5. Workspace context should remain task-focused.

## Related Concepts

- `workspace`
- `thread`
- `community-lens`
- `memory`

