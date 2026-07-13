---
id: product.community_lens
title: Community Lens
audience: builder, member, llm
status: alpha-current
last_verified: 2026-07-13
---

# Community Lens

## Definition

A community lens is explicit community context attached to a personal-agent conversation for future turns.

It tells the workspace agent which community context should apply next.

## Why It Exists

The lens lets one member-owned agent use a specific community's context, resources, skills, and policy without creating a separate agent or conversation for every community.

The lens is the bridge between the personal workspace and the community intelligence system.

## User Mental Model

Switching the lens tells the agent, "Use this community as the context for what happens next."

The lens should be visible enough that the user knows which community the agent is using.

## System Mental Model

The lens is server-validated thread state. It is not just a client-side selection.

The backend validates access before the lens can provide community context. The lens does not grant access by itself.

## Alpha-Current Behavior

The current lens model supports:

- switching the member's active personal-agent episode into a community context
- backend validation before applying community context
- visible community lens state in the workspace shell
- lens changes that apply to subsequent turns only
- runtime checks that fail closed when the community lens is unavailable
- temporary read-only inspection of another accessible community without switching the lens

## Rules

1. The backend must validate membership and entitlement before applying a lens.
2. The lens affects future turns only.
3. Prior thread turns keep their original context.
4. If access is missing, lens context must fail closed.
5. The active lens should be visible and understandable to the user.
6. Community resources, skills, and apps should only be available through the lens when policy allows.
7. Lens switching should be deterministic and auditable.
8. Lens context should not be confused with repo/workspace execution context.
9. The lens is not agent identity or episodic-memory ownership.
10. Cross-community directory reads are explicit tool targets and never implicit lens mutations.

## Examples

- A user switches a thread from a general workspace context into a paid community lens.
- A user switches from one community lens to another before asking a new question.
- A removed or blocked user cannot use a community lens for that community.

## Non-Goals

The community lens is not a secret prompt injection surface and not a way to bypass community access rules.

The community lens is not a coding workspace, workspace snapshot, or file-system context.

## Common Mistakes

- Treating a UI-selected community as proof of access.
- Applying the current lens retroactively to earlier messages.
- Dumping all community knowledge into every turn.
- Letting community instructions override platform rules.

## Related Concepts

- `community`
- `workspace`
- `thread`
- `entitlement`
- `context-model`
