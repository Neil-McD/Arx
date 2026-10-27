# Luna 6 migration: accounting foundation

Status: GPT-6 Luna is the code default for new community-funded inference admissions. Staging and production rollout status must be verified separately against deployed build and Convex state. The prior canary selectors no longer affect new admissions. Historical GPT-5.6 Luna receipts, pricing snapshots, and in-flight runs remain supported for exact settlement; they are not a path for new admissions. The earlier rollout evidence below records its state at the time of each canary.


## Global default cutover — 2026-09-22

The shared community-funded model identity and label now select `gpt-6-luna`. For a fresh receipt, model resolution returns that one default across communities and funding surfaces. For an existing receipt, it returns the receipt's persisted model, including `gpt-5.6-luna` on reclaim. The serve worker initializes usage accounting with the same shared default before loading a receipt-specific model. Luna 6 requests retain Standard-tier request-level usage and the existing paid-run headroom guard.

The old exact-match canary environment variables are inert after this change and should be removed from deployment configuration. The historical 5.6 pricing profile, receipt validator, and runtime handling must remain until old receipts and runs are drained. Legacy pricing environment variables also remain needed for pre-snapshot 5.6 operator receipts; changing them requires the census and reconciliation described under Authority. The founder plan's monthly allowance and checkout price do not change.

The full local release gate passed with 1,636 tests. On staging (`quick-porcupine-949`), a fresh setup admission resolved to GPT-6 Luna. A paid Wiki Architect proposal completed without applying resource changes. Its new receipt `community_setup_generation:wiki_architect:luna6-global-default-cutover-20260922` settled one Standard provider request for 417 microdollars; its allowance cycle retained zero reserved balance. Production deployment and readback are separate acceptance gates, recorded in the release evidence.

## Authority

The monthly founder usage cycle owns the allowance and its accumulated reserved/settled balance. Each newly authorized inference receipt owns an immutable model/pricing snapshot. Reclaiming a receipt preserves that snapshot. Settlement uses the snapshot, never current environment rates or the current model default. Changing models must not reset a cycle or reprice completed runs.

Subscription receipts created before this addition retain their existing cycle-rate settlement path for `gpt-5.6-luna` and `founder_plan_luna_v1`. Older operator-funded receipts have no stored rate snapshot and still require the legacy environment configuration. Before changing those environment values, drain or reconcile all pre-snapshot operator receipts; do not invent their historical rates. New operator receipts snapshot rates before provider start.

## Prepared Luna 6 profile

Source: https://developers.openai.com/api/docs/models/gpt-6-luna (reviewed 2026-09-22).

Exact model: `gpt-6-luna`, Responses transport, 1,050,000 context tokens. Standard pricing per million tokens: input $0.10, cached input $0.01, cache writes $0.125, output $0.50. Above 272,000 input tokens, input/cache rates double and output rates multiply by 1.5 for the full request. Integer arithmetic rounds once to microdollars.

This profile admits Standard processing only. Regional premiums, Fast, Batch, and Flex are not represented. The workflow runtime explicitly enforces this service configuration.

Accounting accepts disjoint ordinary/cached/cache-write input counts, with promptTokens representing their sum. The provider adapter must normalize the actual provider usage schema to that contract; absent fields must not be assumed to mean zero without provider evidence. Luna 6 settlement rejects missing breakdowns, invalid counts, and altered versioned rates. Reasoning output must be included in completionTokens according to provider usage semantics.

## Activation checklist

1. **Verified:** Polynet's provider account can run the exact model on staging and in a scoped production canary.
2. **Verified for exercised paths:** admissions and provider dispatch pin the receipt model; rollback readback selects 5.6 for new runs and retains 6 for the settled canary receipt. Retry identity remains covered by contract tests.
3. **Partial:** successful requests carry verified usage breakdowns and a paid second-call budget stop settled only known usage. Missing or ambiguous usage fails closed in tests, but no real ambiguous provider outcome was induced.
4. **Partial:** text, read-only tools, streaming member turns, and image transport ran live. Luna 6 miscounted a six-node image once, then counted it correctly with the same prompt used by a correct Luna 5.6 control turn. Broader visual quality, structured outputs, latency, and other relevant modes remain to be accepted.
5. **Verified for staged text cases:** member agent, community agent, workflow, setup, writer, and steward produced persisted receipts. The workflow advanced form -> agent response -> next form and held at human approval.
6. **Pending:** review active model-specific product terms and documentation, retaining historical versions.
7. **Pending:** switch the shared active model only after the remaining checks; release through main and explicit Convex deployment. Retain both pricing profiles for settling in-flight receipts during rollback.

## Verification

Behavior tests cover frozen subscription/operator pricing, pre-snapshot settlement, new model settlement in the same existing allowance cycle, cached and cache-write usage, the long-context threshold, missing/invalid usage, and invalid price profiles. Existing receipt lifecycle tests continue to cover replay, expiration, funding authority, and incomplete usage.

## Workflow canary slice

The server-only `POLYNET_LUNA6_WORKFLOW_CANARY_COMMUNITY_ID` selects Luna 6 only for new workflow receipts in one exact community. Other surfaces and communities retain 5.6. Unsetting the selector stops new Luna 6 admissions; reclaimed receipts keep their recorded model. The worker resolves that model before input budgeting, then verifies its funding claim has the same model before provider start.

The Responses adapter requests Standard processing and low reasoning for Luna 6. It reads `usage.input_tokens_details.cached_tokens` and `cache_write_tokens` explicitly; missing values remain unknown. Each provider response ID, returned model, tier, and usage breakdown is retained on the receipt. Settlement validates unique response IDs and token totals, applies long-context pricing separately to each request, and sums the resulting microdollar costs. Missing request usage follows the existing indeterminate path. No runtime changes are made to member-agent or setup model selection in this slice.

Reference: https://developers.openai.com/api/docs/guides/prompt-caching#monitor-cache-performance

## Staging acceptance — 2026-09-22

Backend commit `1518ee1c0` was deployed to `quick-porcupine-949`; production was untouched. A synthetic member submitted the intake form through the browser. The workflow automatically delivered a real GPT-6 Luna response and requested the next form without manual reconciliation. Both forms were submitted, and the owner dossier displayed all three actions verified and “Awaiting human approval.”

One Standard provider request settled: 1,590 input tokens (3 ordinary, 0 cache reads, 1,587 cache writes), 23 output tokens, 211 microdollars ($0.000211). Two completion replays left exactly one Luna 6 receipt, three finished actions, and two submitted forms. No final milestone approval was performed.

The canary environment selector was removed after the proof. Readback selected 5.6 for a new admission and retained 6 for the existing receipt. Automated validation: 1,604 tests across 178 files, Convex typecheck, founder inference contract proof, and community serve-worker contract proof passed.

See `artifacts/luna6-workflow-staging-20260922/acceptance.md` and `receipt.json`. This proves a small text workflow on operator-grant funding, not all modalities, subscription-funded live settlement, or all agent surfaces. Remaining work is representative member/community/setup compatibility, reservation and input-limit review, and a separately authorized production release.

## Member-agent canary slice

`POLYNET_LUNA6_MEMBER_CANARY_COMMUNITY_ID` is a separate server-only selector for new `member_agent_dock` receipts in one exact community. The member runtime resolves the model before recording the run and before input budgeting. It refuses to resume a persisted run under a different model, and it checks the later funding claim against the admitted model before provider start. Streaming and nonstreaming turns send each successful provider response through the same usage collector used by workflow replies. A missing Luna 6 request breakdown remains indeterminate; existing 5.6 aggregate settlement is unchanged. No global default changes in this slice.

### Staging acceptance — 2026-09-22

Backend commit `0616ad260` was deployed to `quick-porcupine-949`. In the synthetic `workflow-sequence-acceptance-20260922` community, the member-agent browser returned a simple text answer and a read-only `polynet_list` answer. The tool turn recorded `polynet_list` started/finished, an `ok` runtime run on `gpt-6-luna`, a Luna 6 input-budget profile and provider attestation, and two distinct Standard provider requests on one settled receipt. The first turn settled at 665 microdollars; the tool turn settled at 843 microdollars. Both responses were visible in the browser.

The member selector was removed after the proof. A fresh admission now resolves to `gpt-5.6-luna`, while the existing receipt still resolves to `gpt-6-luna`. Production was untouched. Automated validation: 1,608 tests across 179 files, Convex typecheck, and founder inference, member dock, and community serve-worker contract proofs passed. See `artifacts/luna6-member-staging-20260922/acceptance.md` and `receipt.json`.

This proves text and one read-only tool loop on the synthetic, operator-funded staging community. Image input, nonstreaming live transport, other agent surfaces, and provider failures remain to be accepted before a global default switch.

## Paid-run reservation guard

The founder usage cycle reserves a fixed maximum per run. A model/tool loop can make multiple provider requests, so an input estimate or a one-time reservation check does not bound the whole turn. For paid Luna 6 member-agent and workflow runs, each provider call now checks the cost of all completed requests plus a conservative maximum for the next one against the receipt's immutable reservation. The maximum uses the admitted 1,050,000-token model context, requested output cap, receipt-local Standard rates, and no cache discount. This check happens before provider start for each call. Operator grants and legacy Luna 5.6 execution retain their existing behavior.

If the next call cannot fit, the turn stops without sending it. Complete usage from prior calls settles at its actual cost and releases the unused reservation. Missing provider usage remains indeterminate and consumes the reserved amount. Failure finalization for funded Luna 6 member turns does not make an unmetered provider call.

### Paid staging acceptance — 2026-09-22

Backend commit `792691fca` was deployed to `quick-porcupine-949`. The existing staging `founder-e2e-783091` community had an active paid founder cycle with zero prior settled/reserved cost and a 1,000,000-microdollar maximum run reservation. In its member-agent browser, a simple Luna 6 turn returned `paid canary received.` and settled one Standard request for 777 microdollars. A read-only `polynet_list` turn then returned the community's top-level entries and settled two distinct Standard requests for 953 microdollars. The runtime recorded a Luna 6 model, input-budget profile, provider attestation, and successful tool event. The cycle ended at 1,730 microdollars settled and zero reserved. No new subscription or payment was created for this proof.

The member selector was removed after the proof. A fresh admission resolves to `gpt-5.6-luna`; the tool-turn receipt remains `gpt-6-luna`. Local proof covers the deterministic stop before an unaffordable next provider call and exact settlement of already-known usage. The live paid turns exercised positive headroom and reservation release; they did not force a budget stop. See `artifacts/luna6-paid-staging-20260922/acceptance.md` and `receipt.json`.

## Community-agent conversation canary

`POLYNET_LUNA6_CONCIERGE_CANARY_COMMUNITY_ID` selects Luna 6 only for new `community_agent_mention` receipts in one exact community. This canonical funding surface covers explicit agent mentions and direct replies to the agent; both must be tested before treating it as accepted. The existing serve worker already resolves the model before input budgeting, binds provider dispatch to the claimed receipt, records each Standard provider response, and applies the paid-run reservation guard. Other agent surfaces and communities remain on 5.6. Unsetting the selector stops new Luna 6 admissions while old receipts retain their immutable model.

### Staging acceptance — 2026-09-22

Backend commit `833b115f4` was deployed to `quick-porcupine-949`. In the existing paid synthetic `founder-e2e-783091` community, a browser @mention, a direct reply to the agent's welcome message, and a direct reply to the agent's answer with an @mention each produced one persisted agent response. The third source turn qualified as both a mention and a direct reply; it produced one serve request and one receipt, with `direct_reply` as the recorded trigger. The scoped `polynet_list` call succeeded and its answer named `community.md`, `members/`, and `resources/`. An earlier request to list `/` was correctly denied with `community_path_required`, and the agent explained that boundary in the thread.

All three receipts used `gpt-6-luna`, Standard provider requests, and the existing paid founder cycle. They settled at 381, 84, and 234 microdollars; the cycle moved from 1,730 to 2,429 settled microdollars and ended with zero reserved. The canary selector was removed. A fresh admission then resolved to `gpt-5.6-luna`, while the existing tool-turn receipt still resolved to `gpt-6-luna`. Production was untouched. Validation: 1,613 tests across 180 files, Convex project typecheck, and founder inference and community serve-worker contract proofs passed. See `artifacts/luna6-concierge-staging-20260922/acceptance.md` and `receipt.json`.

This proves staged text mentions, direct replies, scope enforcement, one read-only tool loop, and paid settlement. It does not accept autonomous cognition, timed service-channel messages, setup generation, image input, or global default activation.

## Canonical funded provider step and setup canary

New admissions use one exact-match canary pair: `POLYNET_LUNA6_CANARY_COMMUNITY_ID` and `POLYNET_LUNA6_CANARY_SURFACE`. Both must match the request's community and funding surface. If either is absent, new receipts use 5.6; an existing receipt keeps its recorded model. The older workflow, member, and concierge selector names above describe historical staging proofs and no longer select a model.

The Wiki Architect proposal action calls `startFundedInferenceRun` for its `community_setup_generation` receipt. That gateway claims funding, checks paid Luna 6 headroom before provider dispatch, sends the receipt model through the shared Responses adapter, records request-level usage, and settles or finalizes the receipt. The Architect still owns its bounded source context and proposal validation. Invalid proposal JSON or validation occurs after the provider usage is settled. The proposal action does not apply resource writes; application remains a separate validated step. Workflow, member, and community-agent callers have not yet been moved to the shared gateway.

### Staging acceptance — 2026-09-22

The existing paid synthetic community returned one valid Wiki Architect proposal on `gpt-6-luna`. Its one Standard request settled 632 microdollars for 3,718 input and 334 output tokens. The cycle rose from 2,429 to 3,061 settled microdollars with zero left reserved. No proposed resource changes were applied. The selector pair was removed; a fresh setup admission returned 5.6 while the old receipt retained 6. See `artifacts/luna6-setup-gateway-staging-20260922/acceptance.md` and `receipt.json`. Production remained on build `824fffa309a2db09f6183990700ee822f978da47`.

## Resource content writer gateway slice

The bounded content writer now uses the same funded provider gateway for its batch receipt and up to eight Responses calls. The writer owns source selection, prompt content, JSON/body validation, and the existing revision-guarded draft mutation. It holds generated bodies until complete provider usage is settled, then applies only valid bodies; an unknown provider outcome stops further calls, finalizes the receipt as indeterminate, and applies no drafts. A malformed page or stale source no longer marks already-known usage as missing. The paid reservation guard runs before every Luna 6 provider call. Zero candidates need no funding claim. The old writer-only fetch, model-selection fallback, and aggregate token parser were removed.

### Staging acceptance — 2026-09-22

Two synthetic source-linked scaffold pages in the existing paid staging community were drafted into review in one writer action. One `gpt-6-luna` receipt held two Standard request breakdowns and settled 305 microdollars, matching the paid cycle increase from 3,061 to 3,366 with zero reserved. Both bodies retained source attribution and an explicit human-review marker; the existing review page was unchanged. The exact canary pair was removed afterward, and fresh setup admissions again resolve to 5.6. See `artifacts/luna6-writer-staging-20260922/acceptance.md`, `fixture-proposal.json`, and `receipt.json`. Production remained at build `824fffa309a2db09f6183990700ee822f978da47`.

## Autonomous steward gateway slice

The community memory steward keeps its existing compiler digest, bounded search/write tools, and retain/carry/dismiss decisions. Run creation now pins the exact `community_autonomous_cognition` receipt model atomically in the run ledger before input budgeting. After shared-kernel input admission, the funding gateway claims that receipt and checks that its model matches before any provider-capable work. A canary change between these steps fails closed without sending a provider request.

Every steward completion uses the funded gateway for the admitted model, per-request usage, paid Luna 6 headroom, and settlement. A response with unverified usage cannot reach the steward's write tool. Complete usage from earlier requests is retained when a later request or tool step fails; retry still relies on the compiler's exact work-key idempotency. Pre-provider failures release the reservation. The global default remains 5.6 and the community memory product behavior is unchanged.

A successful HTTP response can carry verified usage even if its tool arguments are malformed. The Responses adapter keeps that usage on the error result, and each funded caller records it before failing the turn; malformed tools never execute. A response without verifiable Luna 6 request usage remains indeterminate. When a later request is unknown, the receipt now retains earlier verified request records for reconciliation while conservatively settling the full reservation. This does not infer the unknown request's cost or retroactively recover old receipts.

### Staging acceptance — 2026-09-22

Backend commit `fef56f5a0` was deployed to `quick-porcupine-949`. In the existing paid synthetic community, one three-item compiler digest was handled by a real Luna 6 steward pass. All three one-off interaction prompts were dismissed as low signal in one write step. One receipt settled two Standard provider requests for 587 microdollars, exactly matching the paid-cycle increase from 3,366 to 3,953 with zero reserved. A heartbeat replay skipped without another receipt. The canary pair was removed; fresh autonomous admissions again resolve to 5.6 while the settled receipt retains 6. See `artifacts/luna6-steward-staging-20260922/acceptance.md` and `receipt.json`. The test did not exercise a live failure, budget stop, or retain/carry decision; production remained untouched.

## Boundary and production canary acceptance — 2026-09-22

On staging, three browser image turns reached GPT-6 Luna and settled request-level usage. The agent identified the image's black background, miscounted its six pink nodes once, then counted them correctly in a fresh conversation using the exact prompt from a correct GPT-5.6 Luna control turn. The small sample keeps broader visual quality open without establishing a consistent regression. A separate paid staging probe completed one real Standard provider request, refused an unaffordable second request before dispatch, settled the first request's exact 4-microdollar cost, and released the unused reservation. Its temporary internal probe function was removed from staging after the test.

On production, a canary selected only `member_agent_dock` in the unlisted `test` community. A private browser turn returned the requested answer and settled one GPT-6 Luna Standard request. Another community continued selecting GPT-5.6 Luna. The two production selectors were removed immediately afterward; a new admission selects 5.6 while the settled canary receipt remains pinned to 6. The production accounting smoke passed with zero critical findings.

See `artifacts/luna6-boundary-canary-20260922/acceptance.md` for exact receipt and rollback evidence. A real ambiguous provider outcome was not induced; deterministic gateway and receipt tests cover the fail-closed reservation path. This single operator-funded production canary does not establish paid production settlement or support a global default switch.

## Paired staging quality slice — 2026-09-22

Fresh GPT-5.6 and GPT-6 Luna member-agent conversations received identical prompts and files for two image counts and one read-only `polynet_list` task. Both models answered the image questions correctly and listed the same eight community entries with a successful scoped tool event. The same Wiki Architect builder intent produced a valid, unapplied JSON proposal under each model against identical source/page context. All eight receipts settled. The paid cycle retained zero reserved balance. Both staging canary variables were removed; fresh admissions again resolve to 5.6 and existing 6 receipts remain pinned to 6.

This is a four-case compatibility smoke, not a broad quality or latency evaluation. The earlier six-node miscount still matters, and the Wiki Architect prompt-and-validator path does not exercise native Structured Outputs schema mode. See `artifacts/luna6-paired-acceptance-20260922/acceptance.md` for fixtures, answers, costs, durations, and receipt IDs. No production default or backend code changed.
