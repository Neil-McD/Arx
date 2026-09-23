# Luna 6 funded Wiki Architect staging acceptance

Date: 2026-09-22. Backend: `quick-porcupine-949`, candidate commit `7261e1fdc` at provider execution. Existing synthetic paid community: `founder-e2e-783091` (`jx7ds4a2wp2tzt20wjfbhjhw958cgxj0`). No subscription or payment was created.

The exact-match canary pair selected `gpt-6-luna` for `community_setup_generation` and `gpt-5.6-luna` for `member_agent_dock` in the same community. The authenticated Wiki Architect action read two ready sources and returned a valid proposal. The proposal recommended leaving the existing review page unchanged and did not apply any resource or module mutation. An initial CLI call without `authSubject` was rejected by an optional-argument validation error before a funding claim; the authenticated retry succeeded. The action's optional forwarding was corrected after this proof.

The single `community_setup_generation:wiki_architect:setup-gateway-canary-20260922-1559` receipt settled one Standard Responses request. It recorded 3,718 input tokens (3 ordinary, 0 cached, 3,715 cache writes) and 334 output tokens. The receipt settled 632 microdollars. The existing paid cycle moved from 2,429 to 3,061 settled microdollars, exactly the receipt amount, and ended with zero reserved. See `receipt.json`.

Both canary variables were removed. A fresh setup model readback returned `gpt-5.6-luna`, while the settled receipt retained `gpt-6-luna`. Production web remained at build `824fffa309a2db09f6183990700ee822f978da47`; this branch was not released to main or production. The resource content writer, autonomous cognition, image input, and a global model switch remain outside this proof.

Validation: 1,620 Vitest tests across 181 files, Convex project typecheck, and Wiki Architect, founder inference, member-agent dock, and community-agent serve-worker contract proofs passed. The broader community-resources knowledge proof still fails an untouched desktop CSS assertion; this branch changes no web or CSS file.
