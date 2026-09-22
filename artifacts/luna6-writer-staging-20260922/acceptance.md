# Luna 6 resource writer staging acceptance

Date: 2026-09-22. Backend deployment: `quick-porcupine-949`, candidate commit `c1031734e`. Existing synthetic paid community: `founder-e2e-783091` (`jx7ds4a2wp2tzt20wjfbhjhw958cgxj0`). No subscription or payment was created.

The existing ready founder source was linked to two synthetic draft scaffold pages using the guarded Wiki Architect apply mutation. With the exact `community_setup_generation` canary pair set, a new writer receipt resolved to `gpt-6-luna`; `member_agent_dock` in the same community still resolved to `gpt-5.6-luna`. A single writer action with `limit: 2` returned `candidates: 2`, `drafted: 2`, and `failed: 0`. Both pages moved to `review`; their bodies are 783 and 708 characters, contain source attribution and the human-review marker, and no longer contain the scaffold text. The unrelated existing review page kept its original update timestamp.

The writer created exactly one settled receipt with two distinct Standard Responses request IDs. Its totals were 1,191 input tokens and 370 output tokens. It settled 305 microdollars. The paid cycle moved from 3,061 to 3,366 settled microdollars, exactly the receipt cost, and ended with zero reserved. The receipt and page readback are in `receipt.json`.

Both canary variables were removed. A fresh setup receipt now resolves to `gpt-5.6-luna`; the settled writer receipt retains `gpt-6-luna`. Production web remained on build `824fffa309a2db09f6183990700ee822f978da47`; this branch was not released to main or production.

Validation before staging: 1,625 Vitest tests across 182 files, Convex project typecheck, and Wiki Architect, founder inference, member-agent dock, and community-agent serve-worker contract proofs passed. Local behavior tests cover partial page failure, unknown usage with no writes, budget stop, stale-source mutation failure, and zero candidates. The separate community-resources knowledge proof still fails an untouched desktop CSS assertion; this branch changes no web or CSS file.
