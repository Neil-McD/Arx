# Luna 6 autonomous steward staging acceptance

Date: 2026-09-22. Backend: `quick-porcupine-949`, candidate commit `fef56f5a0`. The existing synthetic paid community `founder-e2e-783091` (`jx7ds4a2wp2tzt20wjfbhjhw958cgxj0`) and its existing active founder cycle were used. No subscription or payment was created.

A deterministic compiler pass turned three pending synthetic interaction traces into one exact digest. The exact canary pair selected `gpt-6-luna` only for `community_autonomous_cognition`; a `member_agent_dock` control read selected 5.6. The heartbeat ran one steward pass, wrote one complete decision batch, and marked the digest handled. All three traces were dismissed as one-off, low-signal prompts. No intelligence node or change request was created.

The run ledger recorded `gpt-6-luna` and one successful write tool step. Its one settled receipt recorded two distinct Standard Responses requests: 5,065 input tokens and 396 output tokens in total, with cached and cache-write breakdowns. The receipt settled 587 microdollars. The paid cycle moved from 3,366 to 3,953 settled microdollars and ended with zero reserved. A replay of the same heartbeat skipped with `no_compiler_work`; the original run still had exactly one receipt.

Both canary variables were removed afterward. A fresh autonomous admission returned `gpt-5.6-luna`; the settled receipt retained `gpt-6-luna`. Production remained unchanged. See `receipt.json` for the run, receipt, cycle, digest, trace decisions, and replay readback.

Local validation: 1,627 Vitest tests across 183 files, Convex project typecheck, and community-agent runtime, heartbeat, and founder-inference contract proofs passed. Local gateway tests cover missing request usage, a multi-request run, headroom refusal before provider start, and exact known usage on a steward failure. This staged run establishes the paid positive path and low-signal dismissal, not a live provider failure, budget stop, or retain/carry decision.

A focused compiler replay test now settles a retained decision, then retries the same digest as a later steward failure would. The retry reuses the original node and creates no second change request or learning. The full suite passes with 1,628 tests across 183 files, and the Convex typecheck passes. This verifies the persistence boundary locally; a live retain-then-provider-failure run remains untested.
