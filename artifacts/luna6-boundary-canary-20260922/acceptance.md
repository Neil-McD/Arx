# Luna 6 boundary and production canary acceptance

Date: 2026-09-22. Web/production Convex foundation: merged `bc6e455d1a8efea22ecfee973ec2ce487eeda880`. This is a scoped acceptance record, not approval to change the global default.

## Staging image input

- Deployment: `quick-porcupine-949`; synthetic community `workflow-sequence-acceptance-20260922` (`jx7ategdbt0tpjz6hfhd80m7r18ewq2s`); member-agent canary selected only this community and surface.
- The browser attached the repository's `apps/web/public/icon-512.png` and asked for the number of bright pink circular nodes. The visible answer was **5**; visual inspection of the fixture shows **6**. Receipt `member_agent_dock:member_agent_dock:d68a1ca4-7226-44ae-803f-aa9fd6f1fece` settled one GPT-6 Luna Standard request for 827 microdollars (6,594 input, 5 output tokens).
- A second browser turn attached the same image and asked for its background color. The visible answer was **Black**, matching the fixture. Receipt `member_agent_dock:member_agent_dock:21ae891c-5408-46e5-ac8e-45e501b2e443` settled one GPT-6 Luna Standard request for 845 microdollars (6,739 input, 5 output tokens).
- The attachment, provider response, and receipt accounting path worked. The incorrect count is a model-quality finding; this probe does not claim reliable visual reasoning. The selector pair was removed, and a fresh model-resolution query returned `gpt-5.6-luna`.

## Staging paid second-call budget stop

- Synthetic paid community `founder-e2e-783091` (`jx7ds4a2wp2tzt20wjfbhjhw958cgxj0`) had an open cycle with 3,953 microdollars settled and zero reserved before the probe. Its maximum run reservation was 1,000,000 microdollars.
- A temporary **internal staging-only** action claimed one `community_setup_generation` receipt, made one real GPT-6 Luna Standard request, then attempted a second request with an unaffordable maximum output. The second call returned `founder_inference_run_budget_exhausted` before provider dispatch.
- Receipt `community_setup_generation:luna6-budget-acceptance:20260922-2027` settled with that outcome, exactly **one** provider response ID (`resp_083555e7137a25bb016ab31d08ca6487d292b3f4f9919a9f98`), 10 input and 5 output tokens, and **4 microdollars** of actual cost. The cycle moved to 3,957 settled and zero reserved; 999,996 microdollars of the run reservation were released.
- The temporary function was removed and staging redeployed. Both canary variables were unset. A focused gateway regression test now checks that a second-call refusal preserves prior request usage and sends no second provider request.

## Production member-agent canary

- Canonical production deployment: `wry-hawk-715`; unlisted owner-accessible `test` community (`jh78rtr7ezwhyde00z1qcvrrhx87k0vx`), funded through an operator grant. Before the canary, a new `member_agent_dock` receipt selected `gpt-5.6-luna`.
- Exact community-and-surface selectors admitted GPT-6 Luna only there. A control query for the `polynet` community continued selecting GPT-5.6 Luna. In the `test` community browser, the private agent answered `canary ok` to the controlled prompt.
- Receipt `member_agent_dock:member_agent_dock:1bd04951-4a7b-4ccb-833a-744816555ae7` settled one GPT-6 Luna Standard request (`resp_0acbe4e5e962a7cc016ab31db9717c87d2ab4032c54bb041a0`), 6,095 input and 7 output tokens, for 766 microdollars.
- Both production canary variables were unset immediately after the response. Environment listing showed no `POLYNET_LUNA6_*` variables; a fresh admission selected `gpt-5.6-luna`, while resolving the existing receipt key still returned `gpt-6-luna`. The post-canary `smoke:workspace-credit-accounting-prod-data` health was `pass` with zero critical findings.

## Limit

No real ambiguous provider outcome was forced. Mocked provider/receipt tests cover missing request usage and conservative reservation handling. The production canary covered one private text turn on operator funding, not paid production settlement, other surfaces, or the global default. The image-count error warrants comparison before calling Luna 6's visual behavior accepted.
