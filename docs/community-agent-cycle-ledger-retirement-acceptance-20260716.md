# Community Agent Cycle Ledger Retirement Acceptance — 2026-07-16

Status: data retirement complete; canonical source and staging schema closure complete

## Ground Truth

The retired `communityAgentCycleLedgers` table duplicated historical
Observer/Questioner/Steward `note` tool calls already preserved in
`communityAgentRuns` and `communityAgentRunEvents`.

Before deletion, every row was matched by:

- community id
- cycle id to `communityAgentRuns.heartbeatId`
- role
- bounded run time window
- exact note content nested inside one canonical `tool_call` event

No raw note content was exported into the repository.

## Staging

- deployment: `quick-porcupine-949`
- rows audited: `37`
- exact canonical matches: `37`
- unmatched: `0`
- SHA-256 dataset fingerprint:
  `78fcc5d2a690c85a1960ecc847125e7252f3d4e22fcd693d1f79510ce6ea8f89`
- rows deleted: `37`
- rows remaining: `0`
- matching historical runs preserved: `21`
- migration function removed after use
- schema indexes removed after the zero-row proof

## Production

- deployment: `wry-hawk-715`
- rows audited: `15`
- exact canonical matches: `15`
- unmatched: `0`
- SHA-256 dataset fingerprint:
  `3157c1a30a253ad1ffd84fdcfae1d6af697cd0cd4abd62d1a2d1ff1d2401e384`
- two consecutive read-only audits produced the same row set and fingerprint
- table-scoped Convex replacement deleted exactly `15 of 15` documents
- rows remaining: `0`
- matching historical runs preserved: `12`
- canonical run-event timelines remained readable after deletion

Production data was retired without deploying the feature branch because that
deployment would also have carried unrelated schema changes. The canonical
schema deletion will reach production through the normal validated Convex
release path.

## Canonical Closure

- `communityAgentCycleLedgers` is absent from `convex/schema.ts`
- the temporary retirement module is deleted
- the temporary generated API entry is deleted
- the runtime contract asserts that the legacy table cannot return
- `communityAgentRuns` plus ordered `communityAgentRunEvents` remain the sole
  reconstructable community-agent execution ledger

Convex may continue listing an empty physical table name after its schema and
indexes are removed. Schema source, deployed indexes, and function metadata are
the authoritative retirement proof; the table contains no documents.
