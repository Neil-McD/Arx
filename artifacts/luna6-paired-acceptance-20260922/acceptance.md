# Paired Luna staging acceptance

Date: 2026-09-22. Deployment: `quick-porcupine-949`. This is a bounded quality and runtime comparison, not approval to change the production default.

## Method

- The member-agent cases ran in fresh conversations in synthetic `workflow-sequence-acceptance-20260922` (`jx7ategdbt0tpjz6hfhd80m7r18ewq2s`). GPT-5.6 Luna ran with the canary selector absent. GPT-6 Luna ran with both exact-match selectors set only for that community and `member_agent_dock`.
- Both models received the identical prompt and file for each image case. The existing product icon (`apps/web/public/icon-512.png`, SHA-256 `eb07c2470f6722a964dc34cd289f08b39b3dd54b2672999032665eecd26b3930`) visibly has six pink nodes. The checked-in `fixture-blue-squares.png` (SHA-256 `cc2a0962b59dc1ca0093d609fe7e09840015e0d51cfabbf0021230e486d2c0f7`) visibly has three blue and two red squares.
- The read-only tool prompt was identical in fresh conversations. Both runs recorded a successful, community-scoped `polynet_list` event and returned the same eight top-level entries.
- The Wiki Architect action ran against the same two ready sources and three existing pages in synthetic paid `founder-e2e-783091` (`jx7ds4a2wp2tzt20wjfbhjhw958cgxj0`). It used the same builder intent under each model and returned a proposal; neither proposal was applied. This tests the product's prompt-and-validator JSON path, not the OpenAI native Structured Outputs schema mode.
- Elapsed time below is receipt creation to settlement, not browser end-to-end latency. Costs are settled microdollars for these runs, not a general pricing comparison.

| Case | Expected | GPT-5.6 Luna | GPT-6 Luna |
| --- | --- | --- | --- |
| Product icon, count pink nodes | `6` | `6` | `6` |
| Synthetic image, count blue squares | `3` | `3` | `3` |
| Read-only `polynet_list` | Eight top-level entries, no write | Same eight entries; tool `ok` | Same eight entries; tool `ok` |
| Wiki Architect proposal | Valid proposal on the same context; no applied writes | Valid `rerun`, no draft writes | Valid `rerun`, no draft writes |

| Case | 5.6 receipt suffix | 5.6 cost / elapsed | 6 receipt suffix | 6 cost / elapsed |
| --- | --- | ---: | --- | ---: |
| Product icon | `c2ec2912-a06f-4bc4-a0bd-ed23c40a4b1f` | 1,322 µ$ / 2,626 ms | `087af89a-e190-4cf5-8c23-2eae3ad34d0f` | 825 µ$ / 1,797 ms |
| Synthetic image | `2a328434-5db8-4ea2-b78c-8663b7a9ac89` | 1,320 µ$ / 1,580 ms | `154237b2-91e4-4cf9-bdaa-968143b392a8` | 824 µ$ / 1,410 ms |
| Tool loop | `cd6b4269-f234-4c75-9205-72ebd1abbde0` | 2,727 µ$ / 4,725 ms | `eb006b77-1faf-4b51-8c89-24d2f83e1667` | 942 µ$ / 5,348 ms |
| Wiki Architect | `community_setup_generation:wiki_architect:luna-paired-56-20260922` | 1,288 µ$ / 5,186 ms | `community_setup_generation:wiki_architect:luna-paired-6-20260922` | 725 µ$ / 4,153 ms |

All eight receipts settled. The GPT-6 tool receipt recorded two distinct Standard provider requests and its successful `polynet_list` event was scoped to the synthetic community. The paid founder cycle ended at 5,970 µ$ settled and **zero reserved**, matching its prior 3,957 µ$ plus the two proposal receipts (1,288 and 725 µ$). No membership, payment, source, resource, or module mutation was part of these probes.

The four 6 runs totaled 3,316 µ$ and 12,708 ms of receipt duration versus 6,657 µ$ and 14,117 ms for 5.6. This tiny sample supports a bounded compatibility pass only; it is not a statistically reliable cost, latency, or quality ranking. A previous GPT-6 Luna attempt on the same six-node icon answered `5` before two later attempts answered `6`, so the visual-quality concern remains open.

Both staging selectors were removed. Environment listing found no `POLYNET_LUNA6_*` variables. A fresh model readback returned `gpt-5.6-luna`, while the settled GPT-6 tool receipt still resolved to `gpt-6-luna`. Production was not changed.

## Decision

The paired staging slice passes its four fixed cases. Do not switch the global default on this evidence alone. Remaining gates are broader representative quality and repeated visual checks, paid production settlement, real failure-path observation where safe, product terms/docs review, and a separately verified default activation.
