# Workspace Context Contract V1

## Purpose

This file locks the canonical context precedence for the web-native project-bound agent harness.

It exists to prevent drift between:

- [`PLATFORM.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/PLATFORM.md)
- [`SOUL.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/SOUL.md)
- [`shared/doctrinePrompt.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/doctrinePrompt.ts)
- the workspace runtime assembly paths in [`convex/httpDaytona.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/httpDaytona.ts) and the web send flow

## Source Of Truth

The canonical human/source doctrine is:

1. [`PLATFORM.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/PLATFORM.md)
2. [`SOUL.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/SOUL.md)

The canonical runtime projection is:

- [`shared/doctrinePrompt.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/doctrinePrompt.ts)

`doctrinePrompt.ts` is not an independent doctrine authoring surface. It is the runtime encoding of the markdown doctrine above.

## Canonical Precedence

The workspace context stack is:

1. Platform doctrine
2. Soul doctrine
3. Workspace/runtime doctrine
4. Community doctrine
5. Repo instruction docs
6. User message content

This means:

- Platform comes before everything else.
- Soul shapes agent temperament and posture after platform.
- Workspace/runtime doctrine defines the active harness behavior after platform and soul.
- Community doctrine scopes the active community after the workspace layer.
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
2. soul doctrine
3. workspace/runtime doctrine
4. community doctrine
5. user message content

For anonymous demo turns, the browser assembles the scoped doctrine prompt before sending the turn.

### Authenticated cloud chat

Authenticated chat-only lanes primarily use:

1. platform doctrine
2. soul doctrine
3. workspace/runtime doctrine
4. community doctrine
5. user message content

For authenticated chat-only turns, the server is the canonical doctrine owner. The browser sends conversation and turn metadata; the server resolves the effective community doctrine and assembles the scoped doctrine stack before inference.

When an authenticated chat turn has an active community lens, community intelligence is gathered on demand through the community harness tools (`community_search`, `community_write`) inside the server-owned loop. Authenticated cloud chat does not browser-preload community evidence.

### Daytona tool lane

The Daytona tool lane adds repo/runtime continuity after the doctrine stack:

1. platform doctrine
2. soul doctrine
3. workspace/runtime doctrine
4. community doctrine
5. repo instruction docs
6. user message content

Coding handoff belongs to workspace/runtime continuity, not to community doctrine.

For Daytona tool turns, the server is the canonical doctrine owner. The browser sends conversation and turn metadata; the server resolves the effective community doctrine and assembles the full Daytona doctrine stack.

## Maintenance Rule

When doctrine changes:

1. update [`PLATFORM.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/PLATFORM.md) or [`SOUL.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/SOUL.md) first
2. then update [`shared/doctrinePrompt.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/doctrinePrompt.ts) to match
3. do not add a second independent doctrine surface
