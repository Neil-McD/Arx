# Unknowns and Bounded Falsification Probes

These questions require a separately reviewed read-only staging-data, external-configuration, or behavioral-proof slice. No raw private content or secret value is needed.

## 2026-07-20 staging audit resolution

The bounded aggregate audit resolved or narrowed these questions for the isolated staging snapshot:

| IDs | Resolution |
| --- | --- |
| U-001 | no duplicate auth subjects, normalized emails, or community slugs in complete scans |
| U-002 | resolved by deletion: only one email-bearing user lacked normalized email, but email lookup/relink and its fallback scan were removed; index-miss frequency is no longer a runtime concern |
| U-003 | no ambiguous latest entitlement timestamp; two users have multiple rows and one has 13 |
| U-004 | resolved on staging: duplicate pairs are absent and fail closed; all 44 cached counts equal owner plus active non-owner rows; owner membership creation fails closed and the two unreferenced residues were deleted with a zero-work rerun |
| U-005 | zero memberships omit `active` |
| U-006 | resolved: the one `approved` row had an active membership; it was safely deleted, the migration rerun had zero work, and the final schema permits only `pending \| denied` |
| U-007 | resolved on staging: zero stored deprecated `memberOnboarding` fields and zero activation rows preceded schema/migration deletion; production still has three field values and two activation rows and is promotion-blocked |
| U-008 | sessions exceed 5,000; bounded prefix is dominated by revoked/replacement rows, but total and chain validity remain unknown |
| U-009 | resolved at the code-contract level: unconfirmed bridge/local-revocation failures preserve the browser session and cookie; confirmed local revocation precedes bounded best-effort provider logout; live provider behavior remains configuration-specific |
| U-011 | resolved at ownership level: delete private state, anonymize shared state, preserve minimum finance/legal evidence, and propagate explicit privacy purges; exact TTLs remain open |
| U-013 | 56 anonymous subjects remain unchanged; no active creator path exists and the unowned cleanup executor/tooling are deleted, while reference state and final disposition remain open |
| U-015 | resolved: retain Builder Partner as a secondary capability; prospective 4% community-only economics; no paid-tool commissions |
| U-016 | active/payable/pending partner state and aggregate staging amounts are known; old obligations are preserved, while exact legal lineage and retention treatment remain open |
| U-019 | 67 legacy messages and links remain; runtime read frequency remains unknown |
| U-020 | two of ten resources retain inline body; the other eight have content rows |
| U-021 | the 2026-07-20 audit found five of seven intelligence retrieval receipts with raw query text; C3.3A later scrubbed all five and removed the fields |
| U-022 | one of five intelligence nodes is legacy-unversioned |
| U-024 | current staging is below scheduler caps; the no-cursor defect is latent |
| U-033 | diagnostics and runtime events each exceed the 2,000-row cap; retention policy remains unknown |
| U-026 | narrowed through C7.4B2: standalone browser presentation, duplicate project/conversation authority, proved ownerless styles, all three unmounted runtime viewers, public Workspace destination docs, and tracked stale configuration are deleted while protected project/thread/runtime/billing/harness substrate remains; package ownership is explicit and only deployed-env reconciliation remains in the C7 source/config boundary |
| U-038 | resolved by C0: one repository thesis owns the active destination with explicit implementation states |

Evidence and limitations are in [`04-staging-shape-audit-20260720.md`](04-staging-shape-audit-20260720.md). “Resolved” here normally means data shape observed in this staging snapshot, not a production claim. U-004 additionally has staging-deployed runtime invariants: pair reads fail closed, activation keeps the indexed read plus insert in one transaction, and every community must persist its derived count.

## Identity, access, privacy, and lifecycle

| ID | Unknown | Why it matters | Smallest safe evidence |
| --- | --- | --- | --- |
| U-001 | Are auth subjects, normalized emails, and community slugs unique in staging? | application-level uniqueness can drift | duplicate counts only |
| U-002 | **Resolved:** the actor path no longer queries by email or scans users; the one missing derived profile value does not affect account authority. | removes an unbounded auth cost and alternate binding authority | behavior fixture plus structural no-scan guard |
| U-003 | Can equal/latest entitlement rows disagree? | deterministic tier resolution | histogram and ambiguous-timestamp count |
| U-004 | **Resolved on staging:** membership pairs are unique/fail-closed and cached counts are complete and exact. | access and visible member totals | aggregate duplicate/state/count deltas plus behavioral authority fixture |
| U-005 | How many memberships omit `active`, and which writer created them? | fail-open compatibility removal | state by creation epoch/writer lineage |
| U-006 | **Resolved on staging:** no legacy rows remain; runtime storage is constrained to `pending \| denied`. | closes arbitrary workflow state and alternate access authority | locked preflight/migration receipt plus post-deploy grouped counts |
| U-007 | **Resolved on staging:** the deprecated field and activation table are deleted after complete zero-row scans and zero-work receipts. Production promotion remains blocked on three field values and two activation rows. | schema deletion readiness | zero-work staging receipts plus zero-result production preflight before promotion |
| U-008 | What are session counts/ages/replacement-chain anomalies? | pruning and revocation design | redacted histograms/invalid-chain count |
| U-009 | What happens to provider/server sessions when logout bridge fails? **Resolved at the code-contract level; live provider behavior remains configuration-specific.** | unconfirmed logout preserves the retry handle; confirmed local revocation remains authoritative | behavioral gateway, browser-ordering, and fake-provider fixtures |
| U-010 | Which table fields reference users, communities, DMs, storage, or external objects but lack lifecycle policy? | deletion completeness | generated schema/source ownership matrix |
| U-011 | What should survive account deletion for DMs, community contributions, evidence, finance, legal, and audit? **Resolved at the ownership level; exact finance/legal/security TTLs remain open.** | current algorithm can now be judged against a stable ownership policy | decision record plus field-level lifecycle matrix |
| U-012 | Do DM messages embed storage references and are any orphaned? | storage privacy/cost | encoding inventory and orphan counts, no content |
| U-013 | Which references still point to the 56 legacy `anon:` roots, and should each root be migrated, expired, retained, or later processed through C2? The active creator path is gone and the generic cleanup is deleted. | prevents unsafe root deletion while closing legacy identity residue | schema-derived redacted reference counts followed by an expectation-locked decision; no generic executor |
| U-014 | Can account/community deletion resume after interruption without orphaning or double external effects? | destructive robustness | isolated large synthetic fixture |

## Money and canonical migrations

| ID | Unknown | Why it matters | Smallest safe evidence |
| --- | --- | --- | --- |
| U-015 | Is Builder Partner retained, winding down, or deferred but still accruing? **Resolved: retained as a secondary capability under prospective 4% community-only v3 economics.** | doctrine and future liability | decision record plus later contract migration |
| U-016 | How should pre-v3 partners, commissions, payout rows, and incomplete legal-receipt lineage be reconciled and retained? | safe prospective migration without retroactive rewrite | grouped lineage/state evidence plus mixed-policy fixture, no identities |
| U-017 | **Narrowed to live acceptance:** verified checkout completion owns initial grant; subscription/refund/dispute effects re-read Stripe and atomically converge access; paid-member cancellation is now provider-first, period-end, idempotent, and projected through that same lifecycle; legacy local-only paid leave fails closed. The duplicate recovery queue and its verified-empty physical development table are deleted. Remaining: create one real staging subscription, exercise the deployed cancellation path, and capture a separate Connect settlement receipt. Builder Partner stays last. | access/money correctness | live staging paid-access and settlement receipt |
| U-018 | Which public billing function names have external callers? | alias retirement | gateway logs/client inventory without payloads |
| U-019 | What legacy community chat/link/attachment rows and reads/writes remain? | interaction migration closure | redacted counts and instrumentation |
| U-020 | **Resolved on development staging:** zero resources retain inline/hash/migration fields; all 10 resources have one canonical content row; recent context, digest, evidence, archive, memory, builder, wiki, UI, and tool reads hydrate through the shared owner. | single content authority | C3.1A migration/replay, function-surface audit, complete post-closure aggregate |
| U-021 | **Resolved on development staging:** zero evidence receipts and all seven intelligence receipts now contain zero stored query fields; both optional schema fields and the one-use scrub are deleted. | privacy/schema cleanup | expectation-locked scrub, postflight field-presence count, permanent schema proof |
| U-022 | **Narrowed on development staging:** one of five intelligence nodes remains `legacy_unversioned`; this slice did not change it. | citation migration | trace/citation/retention and actual-consumption audit for the one row |
| U-023 | How should privacy purge propagate through evidence, accepted intelligence, archives, email, and retrieval receipts? | prevents deleted content reappearing | explicit policy plus synthetic lineage fixture |

## Runtime, frontend, operations, and release

| ID | Unknown | Why it matters | Smallest safe evidence |
| --- | --- | --- | --- |
| U-024 | Are there more than 500 communities or capped recurring events/recipients? | determines current starvation impact | cardinality counts only; defect exists regardless |
| U-025 | **The ownerless `communityExperience` namespace is deleted and validated on staging; external use remains unknown.** Which external clients depend on that former namespace, source-module callable names, or legacy MCP wire names? | production transport port readiness and later outer-alias consolidation | bounded function-usage/API consumer evidence or explicit unsupported-contract decision |
| U-026 | **Narrowed through C7.4B2:** standalone Workspace UI is not an MVP destination; its host, navigation, panels/leaves, project adapters, duplicate App authority, proved ownerless styles, all three unmounted runtime viewers, public primitive/member guide, manifest/index entries, generated product projections, ownerless quickstart, and tracked deleted-browser configuration are gone. Browser project identity comes directly from the active thread; the mounted member-agent dock owns live conversation state; backend app-server/terminal/computer execution and evidence, target lifecycle/accounting, generic proxy security, inbound migration routing, and protected project/thread/runtime/billing/harness substrate remain. Three retained package graphs now have explicit installed-artifact ownership and CI enforcement. | final browser/UI deletion boundary | U-031 deployed-name reconciliation plus exact-build staging acceptance |
| U-027 | **Narrowed through C7.3C:** deleted-host, pre-ConversionLanding, loading, starter, download, session-resume, and three dormant-viewer selector families are classified and removed; the two live setup kickers have a neutral owner; shared generic skeleton, negative, dynamically generated, and onboarding styles remain. Which remaining ownerless lexical candidates are dynamically generated or visually used? | safe CSS deletion | fresh caller-led proof before any further cohort; do not treat lexical absence as deletion authority |
| U-028 | Is another branch-protection workflow running web build/typecheck/journeys? | CI gap severity | GitHub required-check configuration/workflow inventory |
| U-029 | Which of 241 `check:*` commands own unique invariants and when are they invoked? | proof deletion/consolidation | generated owner/invocation matrix |
| U-030 | **Resolved in C7.4B2:** root, web, and preview proxy are independently installed Vercel/Convex, browser, and Fly/Docker artifacts under Node 22; one active contract and CI proof own isolation and shared-range parity. | prevents dependency/deployment drift | any fourth graph, workspace coupling, or shared declared-range mismatch fails the package boundary proof |
| U-031 | **Narrowed by C7.4C names-only staging preflight:** the five C7-dead candidates have zero current readers. Canonical staging retains exactly `VITE_WORKSPACE_PREVIEW_ORIGIN` in the staging Vercel production target and `POLYNET_DAYTONA_APP_PREVIEW_TRANSPORT` in Convex development staging; `VITE_WORKSPACE_LIVE_DESKTOP_PROXY_ORIGIN`, `POLYNET_DAYTONA_PREVIEW_URL_PATTERN`, and `VITE_ENABLE_RUNTIME_TURN_V2` are absent there. Broader production and unrelated-name ownership remain outside this staging-only slice. | closes C7 staging configuration drift without exposing values or widening into global env cleanup | remove the two confirmed stale staging names after the release candidate is live, then repeat the redacted inventory |
| U-032 | What request-rate and payload bounds apply to every public HTTP/API/MCP route? | abuse/cost posture | route contract matrix and boundary fixtures |
| U-033 | What are audit/diagnostic/runtime retention and privacy rules? | unbounded growth and deletion conflict | policy plus age/cardinality histograms |
| U-034 | What is the actual operator dashboard read/query cost at realistic scale? | N+1 risk | isolated fixture with read/query budget |
| U-035 | What are product-data backup provider, cadence, retention, RPO/RTO, and tested restore steps? | disaster recovery | configuration evidence and isolated restore drill |
| U-036 | Which browser security headers are required by the threat model? | avoid cargo-cult header changes | documented baseline and automated response assertions |
| U-037 | Does the signed-in staging product complete all eleven journeys at the frozen commit? | static map is not runtime truth | bounded scripted/manual smoke with receipts |
| U-038 | **Resolved by C0:** the semantic-platform destination is adopted in one repository thesis, with implementation states preventing a second normative plane. | prevents direction from masquerading as current code | canonical thesis plus doctrine/finding reconciliation |

## Next evidence slices

1. Convert the resolved U-011 ownership model into the smallest two-user shared-DM/community-content deletion fixture and fail-closed safety boundary.
2. Design the U-015/U-016 Builder Partner v3 terms, policy-version, and mixed-ledger migration proof; do not rewrite historical rows.
3. Inventory external consumers/configuration for U-025, U-028, U-031, and U-035.
4. Use isolated behavioral fixtures for U-009, U-014, U-017, U-023, scheduler fairness, and U-037.
5. Instrument legacy/auth compatibility reads before deleting paths whose row prevalence is now known.
