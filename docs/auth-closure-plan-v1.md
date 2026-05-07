# Authentication Closure Plan v1

Status: archived / superseded

This file is retained only so existing links do not break.

It is not an active contract and it contains stale closure assumptions from an older cleanup phase.

Use these instead:

1. Canonical auth + funding + access contract:
   - [/Users/neilmcdevitt/code/arx/docs/auth-money-access-matrix.md](/Users/neilmcdevitt/code/arx/docs/auth-money-access-matrix.md)
2. Active docs index:
   - [/Users/neilmcdevitt/code/arx/docs/README.md](/Users/neilmcdevitt/code/arx/docs/README.md)
3. Schema/data cleanup discipline:
   - [/Users/neilmcdevitt/code/arx/docs/schema-data-migration-discipline.md](/Users/neilmcdevitt/code/arx/docs/schema-data-migration-discipline.md)

Why it was superseded:

1. It still discussed runtime/auth cleanup as if the old transition phase were active.
2. The live worktree now uses the canonical matrix plus runtime truth in `runtimeRuns` / `runtimeRunEvents`.
3. New implementation work should not be guided by this document.
