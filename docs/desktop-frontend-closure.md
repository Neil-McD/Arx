# Desktop frontend closure

## Verified baseline

Production `version.json` and fetched `origin/main` both identify `aa0386609bab3fa7d997f71b512324f4ab2f6435` at this review. The isolated review branch starts from that exact revision; the unrelated active-worktree changes are excluded.

- [Profile/loading release #138](https://github.com/Neil-McD/Arx/pull/138): request ownership, per-field drafts, stable avatar loading and actionable failures. Historical signed-in acceptance includes reversible Bio saving and draft-only avatar operations, not persisted photo replacement or account switching.
- [Owner simplification #139](https://github.com/Neil-McD/Arx/pull/139): one Events Retry owner and one derived Profile save status.
- [Events/Resources release #140](https://github.com/Neil-McD/Arx/pull/140): bounded event overlap, lifecycle clock and independently recoverable Resources reads.
- [Final Events presentation #142](https://github.com/Neil-McD/Arx/pull/142): plain scrolling month navigation and visibly muted past rows. This supersedes the sticky header/Today presentation from #141, not the underlying lifecycle/query contracts.
- [Post-main release gate](https://github.com/Neil-McD/Arx/actions/runs/33945169204) is now completed successfully for the production revision. Earlier receipts saying it was pending are historical, not current blockers.

Media behavior remains specified in [message media reading](message-media-reading-v1.md): native YouTube players, grouped previews, clipped rounded corners and the shared lazy PDF reader. Do not create surface-local replacements for these owners.

## This review

Read-only production checks found September's past event correctly exposed as past, without Join/calendar actions, and future events retaining those actions. Resources rendered the existing course. Profile resolved its avatar and exposed the existing unsaved draft; no fields were changed or saved.

One navigation gap was reproduced: clicking the already-selected Polynet rail item from Profile leaves Settings open. The baseline `WebCommunityRail` explicitly opened community chat only from Discover; `handleSelectActiveCommunity` otherwise synchronized selection. The local follow-up extends that existing desktop entry condition to `global_settings`. It retains the guarded selection callback before entry, the canonical chat route controller and its single navigation snapshot. Existing in-community tab behavior and mobile behavior are unchanged. No Profile draft, authorization, CSS, state or effect implementation changes are included. This correction is not yet deployed.

Seven additional real React/browser fixture checks mount the rail with the actual selection and route controllers. Both same-community and different-community Settings entry failed against the unchanged component, while Discover entry, existing Events navigation and rejected discard passed. All seven pass with the correction. Snapshot checks assert one pre-click snapshot and restoration of the source page; this is not a full signed-in browser Back/URL synchronization canary. Existing Profile draft tests remain regression coverage, not a new live Profile-edit test.

The navigation follow-up passed the complete local `release:gate`, including 50 loading/browser checks, media checks, typechecks, production build, bundle budget, foundation proofs and dependency audits (zero vulnerabilities). `artifacts/release-gate.json` records the dirty working-tree candidate based on `aa0386609bab3fa7d997f71b512324f4ab2f6435`; it does not certify that unchanged commit as containing this fix and is not a clean CI release receipt. Prior closure documentation/test-runner edits remain separate from the one-condition product correction and its seven tests.

The media browser runner initially failed because its strict port policy rejected an occupied development port. Automated runs now use Vite's available-port fallback and its resolved URL, as the loading runner already does. Interactive `--serve` retains its fixed port and strict policy. This changes test infrastructure only, not product performance.

Initial closure validation: 22 loading-related unit tests and 43 loading/browser checks passed, with no page errors in the successful browser run. The first loading attempt timed out before fixture initialization; a rerun passed, so repeat-run stability is not proven by that recovery. The media browser proof passed after the port-policy correction, including deferred/stable YouTube mounting, PDF interaction/recovery and DM dialog ownership. These are development-fixture correctness checks, not production timing samples. The subsequent navigation follow-up added seven checks and passed the full local gate as recorded above. `git diff --check` passed. No new deployment was performed.

## Remaining gates, in order

1. **Navigation acceptance:** the local correction and seven regression checks are complete. Before release acceptance, verify full-app browser Back/URL synchronization and Profile draft preservation across the route round trip. Production remains unchanged until an explicit release decision.
2. **Measured performance:** record cold and warm route entry, useful-content readiness, layout shifts and interaction traces on desktop for chat/DM, Profile, Events, Resources and Discover/funnel/settings. Use repeatable viewport/network/cache conditions and retain traces. Report fixture measurements separately from signed-in production; tool-call durations are not product latency. No broad speed improvement or race-free claim is established by this review.
3. **Conditional optimization:** fix only a reproduced bottleneck or unstable transition. Require before/after measurements and canonical-owner tests; no speculative cache, pagination or hydration framework.
4. **Explicitly bounded acceptance:** real account switching, persisted avatar upload and billing-return transitions remain outside this read-only pass. Existing deterministic race tests do not replace those live checks.

Resources still has an explicit 200-row UI boundary with overflow reporting; backend pagination is deferred until separately scoped. Mobile, workflows, visual redesign and protected platform-core deletion are excluded.

## Closure rule

The targeted shipped UI/correctness batch and whole-frontend performance certification are different deliverables. Do not collapse them into a single completion percentage. Close the batch after its regression evidence; retain the navigation and measurement gates above as named open work. This review does not authorize or require a production deployment.
