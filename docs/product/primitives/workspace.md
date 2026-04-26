---
id: product.workspace
title: Workspace
audience: builder, member, llm
status: alpha-current
last_verified: 2026-04-26
---

# Workspace

## Definition

The workspace is the personal AI surface where users run persistent threads and can switch the active community lens for future agent turns.

It is the place where a user works with the agent across communities and contexts.

## Why It Exists

The workspace gives users one place to work across communities, threads, and agent contexts without turning Polynet into an IDE.

The workspace keeps the product focused on AI work and context switching, not a sprawling app surface for every possible workflow.

## User Mental Model

A user opens a thread, asks questions, performs work, and can choose which community context should guide the next turns.

The user should always be able to understand which thread they are in and which community lens, if any, is active.

## System Mental Model

The workspace is thread-centered. The active thread stores messages and policy state. A community lens can be attached to the thread only after backend validation.

The workspace is not the authority for access, billing, membership, or tool permission. It projects backend state and submits actions to backend-controlled routes.

## Alpha-Current Behavior

The current workspace supports:

- persistent AI threads
- route-addressable thread URLs
- community lens switching
- voice input
- personal memory controls
- runtime/tool policy surfaces
- runtime evidence for thread, lens, and agent execution flows

## Rules

1. The workspace is not the product source of truth for access.
2. Thread state must be durable and auditable.
3. Community lens changes affect future turns only.
4. Workspace tools must be bounded and approved where required.
5. The workspace should remain focused on the user task, not become an IDE surface.
6. The active lens should be visible and deterministic.
7. Workspace actions should fail clearly when auth, entitlement, or runtime configuration is missing.
8. Long threads should be managed with summaries, memory, or bounded context rather than unbounded prompt growth.

## Examples

- A user opens a long-running thread and continues work from yesterday.
- A user switches a thread from one community lens to another before the next message.
- A user dictates a prompt with voice input, reviews the transcript, then sends it.

## Non-Goals

The workspace is not a replacement for Codex, Claude Code, Discord, or a full IDE. It should sit between product, community, and agent context rather than compete with every specialized tool.

## Common Mistakes

- Treating the selected community icon as backend authority.
- Assuming a lens switch rewrites previous messages.
- Letting long thread context make every interaction slow.
- Expanding workspace tools before the core thread and lens loop is reliable.

## Related Concepts

- `thread`
- `community-lens`
- `agent`
- `entitlement`
- `voice`
- `memory`
