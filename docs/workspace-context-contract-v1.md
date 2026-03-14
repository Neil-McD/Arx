# Workspace Context Contract V1

## Purpose

This file locks the canonical context precedence for the web-native project-bound agent harness.

It exists to prevent drift between:

- [`PLATFORM.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/PLATFORM.md)
- [`SOUL.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/SOUL.md)
- [`shared/runtimePrompt.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/runtimePrompt.ts)
- the workspace runtime assembly paths in [`convex/httpDaytona.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/httpDaytona.ts) and the web send flow

## Source Of Truth

The canonical human/source doctrine is:

1. [`PLATFORM.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/PLATFORM.md)
2. [`SOUL.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/SOUL.md)

The canonical runtime projection is:

- [`shared/runtimePrompt.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/runtimePrompt.ts)

`runtimePrompt.ts` is not an independent doctrine authoring surface. It is the runtime encoding of the markdown doctrine above plus the prompt-composition rules for the active runtime lanes.

## Canonical Precedence

The workspace context stack is:

1. Platform doctrine
2. Agent soul
3. Community lens
4. Workspace context
5. Agent operating policy
6. Repo instruction docs
7. User message content

This means:

- Platform comes before everything else.
- Soul shapes agent temperament and posture after platform.
- Community lens scopes the active community after platform and soul.
- Workspace context defines the active run environment after the community lens.
- Agent operating policy defines how the agent behaves within the active run.
- Repo instruction docs such as `AGENTS.md` and `CLAUDE.md` are repo-local execution rules, not platform doctrine.
- User-injected prompts, starter actions, and normal user messages are interpreted through all prior doctrine layers. They do not outrank them.

## Explicit Exclusions

- Personal prompts are not part of the context stack.
- Community intelligence evidence is not the same thing as community doctrine.
- Community intelligence evidence should be gathered on demand through the active tool harness, not browser-preloaded as prompt text for authenticated turns.
- Daytona snapshots are not the community lens.

## Lane Notes

### Anonymous demo

The anonymous demo path primarily uses:

1. platform doctrine
2. agent soul
3. community lens
4. workspace context
5. agent operating policy
6. user message content

For anonymous demo turns, the browser assembles the scoped doctrine prompt before sending the turn.

### Authenticated cloud chat

Authenticated chat-only lanes primarily use:

1. platform doctrine
2. agent soul
3. community lens
4. workspace context
5. agent operating policy
6. user message content

For authenticated chat-only turns, the server is the canonical doctrine owner. The browser sends conversation and turn metadata; the server resolves the effective community doctrine and assembles the scoped doctrine stack before inference.

When an authenticated chat turn has an active community lens, that lens is applied through prompt composition in the server-owned chat run. Authenticated cloud chat does not browser-preload community evidence and does not expose a separate community tool harness in the current reduced system.

### Daytona tool lane

The Daytona tool lane adds repo/runtime continuity after the doctrine stack:

1. platform doctrine
2. agent soul
3. community lens
4. workspace context
5. agent operating policy
6. repo instruction docs
7. user message content

Coding handoff belongs to workspace context and operating policy, not to the community lens.

For Daytona tool turns, the server is the canonical doctrine owner. The browser sends conversation and turn metadata; the server resolves the effective community doctrine and assembles the full Daytona doctrine stack.

## Maintenance Rule

When doctrine changes:

1. update [`PLATFORM.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/PLATFORM.md) or [`SOUL.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/SOUL.md) first
2. then update [`shared/runtimePrompt.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/runtimePrompt.ts) to match
3. do not add a second independent doctrine surface
