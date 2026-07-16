# Community Memory Kernel Staging Acceptance — 2026-07-16

## Scope

This certificate closes the first canonical community-memory kernel slice on
the Convex staging deployment. It covers the production heartbeat, digest,
decision, settlement, evidence-revocation, and continuation paths. It does not
authorize or describe a production release.

## Deterministic acceptance

The isolated lifecycle fixture passed with three automatically traced evidence
items and one exact three-item digest:

- one item was carried forward into existing memory
- one hostile low-signal item was dismissed
- one item was retained as new memory
- the handoff reached `handled` only after every decision settled
- revoked evidence disappeared from member search, the member directory, and
  the public overview
- a stale source-revision batch rolled back atomically

## Real-model acceptance

The staging Steward ran through the ordinary founder-funded heartbeat and model
tool loop:

- the first heartbeat settled a bounded twelve-item digest using
  `search`, `search`, `write`
- the second heartbeat settled the two-item continuation using one `write`
- each digest received exactly one complete write covering every `workKey`
- both handoffs settled terminally and pending compiler evidence reached zero
- the connected sponsor state remained intact

## Cleanup and deletion

The disposable fixture community and agent-run rows were removed, and the
temporary acceptance environment flag was removed. The deployed acceptance
action was then deleted from the canonical codebase. Durable, non-deployed
evidence lives in
`scripts/fixtures/community_memory_staging_acceptance_20260716.json` and is
validated by the compiler candidate contract proof.

The runtime accepted by this certificate is the five-commit kernel ending at
`32b7505dff2f8e9ff5618883a992cc351cc3eab5`. The subsequent hardening change
only removes the acceptance action and records this certificate; it does not
change the accepted memory runtime.
