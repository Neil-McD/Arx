# Luna 6 member-agent staging acceptance

Date: 2026-09-22. Backend: `quick-porcupine-949`, commit `0616ad260`. Community: `workflow-sequence-acceptance-20260922` (`jx7ategdbt0tpjz6hfhd80m7r18ewq2s`). This is synthetic staging data.

- Browser simple turn replied `member canary received.` Run and receipt were `gpt-6-luna`; one Standard provider request settled at 665 microdollars.
- Browser tool turn called the read-only `polynet_list` tool at `/` and displayed `community.md`, `members/`, `resources/`, `channels/`, `events/`, `memory/`, and `capabilities/`. Runtime events recorded `tool_call_started` and successful `tool_call_finished`. Run status was `ok`, model `gpt-6-luna`.
- The tool turn's input-budget event used `openai/gpt-6-luna` and the 1,050,000-token context profile. Provider context attestation requested `gpt-6-luna`. Two distinct Standard provider response IDs and their disjoint cache breakdowns were retained; the receipt settled at 843 microdollars. See `receipt.json` for scoped evidence.
- The member canary selector was removed immediately after the probes. Direct model-resolution readback returned `gpt-5.6-luna` for a new receipt key and `gpt-6-luna` for the existing tool-turn receipt key.
- Production and `origin/main` were not changed. The candidate remains on `codex/luna6-accounting-20260922`.

Automated proof: 1,608 tests across 179 files, Convex typecheck, founder inference contract proof, member-agent dock contract proof, and community serve-worker contract proof passed.

Scope: browser text and one read-only tool loop on an operator-funded synthetic community. Live image, nonstreaming, subscription funding, provider failure, and other agent surfaces remain unproved. No default-model switch or production release was performed.
