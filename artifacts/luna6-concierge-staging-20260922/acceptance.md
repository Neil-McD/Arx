# Luna 6 community-agent conversation staging acceptance

Date: 2026-09-22. Backend: `quick-porcupine-949`, candidate commit `833b115f4`. Existing synthetic paid community: `founder-e2e-783091` (`jx7ds4a2wp2tzt20wjfbhjhw958cgxj0`). No subscription or payment was created for this proof.

- The browser sent a canonical @mention in `#General`. The agent replied in its thread. The serve request recorded `triggerKind=mention`, `status=responded`, and one response reply. Its `gpt-6-luna` subscription receipt settled two Standard provider requests for 381 microdollars. `polynet_list` at `/` was denied by `community_path_required`; the agent explained the restriction instead of inventing entries.
- The browser replied to the agent-authored welcome root without a mention. The agent returned `direct reply received.` The serve request recorded `triggerKind=direct_reply`, `status=responded`, and one response reply. Its Luna 6 receipt settled one Standard request for 84 microdollars.
- The browser then replied to an agent answer with an @mention and asked for read-only `polynet_list` at `/communities/founder-e2e-783091/`. Despite qualifying as both a direct reply and a mention, that source produced one serve request, one response reply, and one Luna 6 receipt. The tool event recorded `polynet_list` `ok`; the visible answer named `community.md`, `members/`, and `resources/`. Two Standard provider requests settled for 234 microdollars.
- The existing paid cycle started this slice at 1,730 settled and zero reserved microdollars. It ended at 2,429 settled and zero reserved, exactly 699 more, matching the three receipts. The immutable provider request breakdowns and response IDs are in `receipt.json`.
- The selector was removed after the browser proof. A fresh `community_agent_mention` model readback returned `gpt-5.6-luna`; readback for the settled tool-turn receipt returned `gpt-6-luna`. `origin/main` and the production web app were not released from this branch.

Validation before staging deploy: 1,613 tests across 180 files, Convex project typecheck, founder inference and community serve-worker contract proofs. The CLI's broader optional typecheck reports existing unrelated errors; the staging push used `--typecheck disable` after the focused project typecheck passed.

This accepts only text conversation and one read-only scoped tool loop on this staged paid community. It does not cover autonomous cognition, timed messages, setup generation, image input, or a global default switch.
