---
id: product.agent
title: Agent
audience: builder, member, llm
status: alpha-current
last_verified: 2026-07-27
---

# Agent

## Definition

An agent is the AI product surface that helps users reason, decide, create, and act inside Polynet.

The agent can be the product itself when it packages a builder's expertise, workflow, judgment, resources, and connected capability.

## Why It Exists

The agent is how builder expertise, community context, resources, skills, and connected tools become useful capability.

Without the agent, the community is mostly conversation and content. With the agent, the community can become an active system that helps members do work.

## User Mental Model

The member's personal agent should remain one continuous intelligent surface across Polynet, not become a separate agent for every community.

The bottom-right agent belongs to the signed-in member. It keeps that member's episodic history while orienting to the current Polynet surface. Community pages use that community as a server-validated lens for subsequent turns; Discover and generic platform pages carry no community lens.

## System Mental Model

Agent behavior is assembled from explicit authority and context layers. The canonical precedence is defined in `reference/context-model.md` and the internal runtime context contract.

The high-level order is:

1. platform doctrine
2. agent soul
3. current Polynet surface
4. community lens, if backend validated
5. platform harness and optional project context
6. agent operating policy
7. repo instruction docs, where relevant to the active runtime lane
8. user message content

Runtime inputs can include user/session state, thread history, community resources, skills, apps/MCP tools, and runtime policy. Those inputs do not outrank the authority stack.

## Alpha-Current Behavior

The current product model supports:

- persistent personal-agent conversations backed by internal thread records
- one member-owned personal agent channel across communities
- on-demand episodic recall across that member's prior conversations
- read-only recall compatibility for retained legacy per-community episodes
- community-page context applied to subsequent turns after backend validation
- deterministic Discover, community-section, and generic platform-page orientation
- native read-only directory access to joined and public Discover communities
- community resources and skills as controlled context inputs
- apps/MCPs as explicit capability surfaces
- personal memory as an explicit user-owned context layer
- voice input as an input method
- backend-gated community context and tool access

## Rules

1. Platform safety and access rules are higher authority than community instructions.
2. Community owner instructions shape behavior but must not bypass entitlements.
3. The agent should only use community context when access is validated.
4. Tool access must be explicit and bounded.
5. Prompts should reference docs; prompts should not become hidden product truth.
6. Skills should be injected intentionally, not dumped into every turn.
7. Apps/MCP tools should not be represented as available unless the runtime can actually use them.
8. The agent should preserve broader user intent when the request is not actually community-scoped.
9. Community navigation may change the next-turn lens, but it must not replace the member's agent or conversation.
10. Retained legacy per-community episodes are historical recall sources only; new messages and runtime turns use the active global episode.
11. Page context guides relevance but cannot grant community access or tools.
12. Discover must not silently inherit Polynet or the last visited community as its active lens.
13. Reading another community through directory tools must not mutate the active lens, current page, or episode.

## Examples

- A member asks a general question from Discover with no community lens active.
- A member opens the agent from a community page and asks it to use the community's resources.
- A member asks for help comparing communities from Discover with no active community lens.
- A builder configures a community agent to follow a specific methodology.
- A selected skill shapes the output format for a repeated workflow.

## Non-Goals

The agent is not a general-purpose replacement for every product surface. It should support the creator setup and member participation loop.

The agent is not allowed to grant access, invent billing state, expose private community data, or claim tool capability that is not actually mounted and permitted.

## Common Mistakes

- Treating prompts as policy authority.
- Treating community instructions as higher priority than platform rules.
- Treating connected apps as automatically usable by every user.
- Treating skills as generic prompt blobs.
- Treating private member usage as community knowledge.

## Related Concepts

- `thread`
- `community-lens`
- `context-model`
- `prompt-context-model`
- `skill`
- `app-mcp`
- `resource`
