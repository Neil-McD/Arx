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
| U-006 | one join request, status `approved` |
| U-007 | zero stored deprecated `memberOnboarding` fields |
| U-008 | sessions exceed 5,000; bounded prefix is dominated by revoked/replacement rows, but total and chain validity remain unknown |
| U-009 | resolved at the code-contract level: unconfirmed bridge/local-revocation failures preserve the browser session and cookie; confirmed local revocation precedes bounded best-effort provider logout; live provider behavior remains configuration-specific |
| U-011 | resolved at ownership level: delete private state, anonymize shared state, preserve minimum finance/legal evidence, and propagate explicit privacy purges; exact TTLs remain open |
| U-013 | 56 anonymous subjects exist; creator/reference lifecycle remains unknown |
| U-015 | resolved: retain Builder Partner as a secondary capability; prospective 4% community-only economics; no paid-tool commissions |
| U-016 | active/payable/pending partner state and aggregate staging amounts are known; old obligations are preserved, while exact legal lineage and retention treatment remain open |
| U-019 | 67 legacy messages and links remain; runtime read frequency remains unknown |
| U-020 | two of ten resources retain inline body; the other eight have content rows |
| U-021 | five of seven intelligence retrieval receipts retain raw query text |
| U-022 | one of five intelligence nodes is legacy-unversioned |
| U-024 | current staging is below scheduler caps; the no-cursor defect is latent |
| U-033 | diagnostics and runtime events each exceed the 2,000-row cap; retention policy remains unknown |

Evidence and limitations are in [`04-staging-shape-audit-20260720.md`](04-staging-shape-audit-20260720.md). “Resolved” here normally means data shape observed in this staging snapshot, not a production claim. U-004 additionally has staging-deployed runtime invariants: pair reads fail closed, activation keeps the indexed read plus insert in one transaction, and every community must persist its derived count.

## Identity, access, privacy, and lifecycle

| ID | Unknown | Why it matters | Smallest safe evidence |
| --- | --- | --- | --- |
| U-001 | Are auth subjects, normalized emails, and community slugs unique in staging? | application-level uniqueness can drift | duplicate counts only |
| U-002 | **Resolved:** the actor path no longer queries by email or scans users; the one missing derived profile value does not affect account authority. | removes an unbounded auth cost and alternate binding authority | behavior fixture plus structural no-scan guard |
| U-003 | Can equal/latest entitlement rows disagree? | deterministic tier resolution | histogram and ambiguous-timestamp count |
| U-004 | **Resolved on staging:** membership pairs are unique/fail-closed and cached counts are complete and exact. | access and visible member totals | aggregate duplicate/state/count deltas plus behavioral authority fixture |
| U-005 | How many memberships omit `active`, and which writer created them? | fail-open compatibility removal | state by creation epoch/writer lineage |
| U-006 | Which join-request statuses exist? | validator migration | grouped counts only |
| U-007 | Does deprecated `memberOnboarding` exist on live rows? | schema deletion readiness | count and migration receipt |
| U-008 | What are session counts/ages/replacement-chain anomalies? | pruning and revocation design | redacted histograms/invalid-chain count |
| U-009 | What happens to provider/server sessions when logout bridge fails? **Resolved at the code-contract level; live provider behavior remains configuration-specific.** | unconfirmed logout preserves the retry handle; confirmed local revocation remains authoritative | behavioral gateway, browser-ordering, and fake-provider fixtures |
| U-010 | Which table fields reference users, communities, DMs, storage, or external objects but lack lifecycle policy? | deletion completeness | generated schema/source ownership matrix |
| U-011 | What should survive account deletion for DMs, community contributions, evidence, finance, legal, and audit? **Resolved at the ownership level; exact finance/legal/security TTLs remain open.** | current algorithm can now be judged against a stable ownership policy | decision record plus field-level lifecycle matrix |
| U-012 | Do DM messages embed storage references and are any orphaned? | storage privacy/cost | encoding inventory and orphan counts, no content |
| U-013 | How many `anon:` users exist and what still creates them? | cleanup may be obsolete or dangerous | counts by age/creator path/reference state |
| U-014 | Can account/community deletion resume after interruption without orphaning or double external effects? | destructive robustness | isolated large synthetic fixture |

## Money and canonical migrations

| ID | Unknown | Why it matters | Smallest safe evidence |
| --- | --- | --- | --- |
| U-015 | Is Builder Partner retained, winding down, or deferred but still accruing? **Resolved: retained as a secondary capability under prospective 4% community-only v3 economics.** | doctrine and future liability | decision record plus later contract migration |
| U-016 | How should pre-v3 partners, commissions, payout rows, and incomplete legal-receipt lineage be reconciled and retained? | safe prospective migration without retroactive rewrite | grouped lineage/state evidence plus mixed-policy fixture, no identities |
| U-017 | How do Stripe events converge under delay, reversal, dispute, refund, and outage? | access/money correctness | provider fixture with idempotency receipts |
| U-018 | Which public billing function names have external callers? | alias retirement | gateway logs/client inventory without payloads |
| U-019 | What legacy community chat/link/attachment rows and reads/writes remain? | interaction migration closure | redacted counts and instrumentation |
| U-020 | How many resources still have inline body and which readers use it at runtime? | single content authority | counts by age/type plus read-path counters |
| U-021 | Do retrieval logs retain raw query fields? | privacy/schema cleanup | non-null counts/age only |
| U-022 | How many intelligence nodes are `legacy_unversioned`? | citation migration | grouped evidence-state counts |
| U-023 | How should privacy purge propagate through evidence, accepted intelligence, archives, email, and retrieval receipts? | prevents deleted content reappearing | explicit policy plus synthetic lineage fixture |

## Runtime, frontend, operations, and release

| ID | Unknown | Why it matters | Smallest safe evidence |
| --- | --- | --- | --- |
| U-024 | Are there more than 500 communities, 2,000 AI-feed communities, or capped recurring events/recipients? | determines current starvation impact | cardinality counts only; defect exists regardless |
| U-025 | Which first-party/external clients depend on `communityExperience`, source-module callable names, or legacy MCP wire names? | transport deletion readiness | static plus access-log/API consumer inventory |
| U-026 | Is standalone Workspace UI required by any current MVP journey, or only protected substrate? | route/UI deletion boundary | explicit decision plus navigation telemetry counts |
| U-027 | Which lexical CSS candidates are dynamically generated or visually used? | safe CSS deletion | instrumented class coverage and screenshot matrix |
| U-028 | Is another branch-protection workflow running web build/typecheck/journeys? | CI gap severity | GitHub required-check configuration/workflow inventory |
| U-029 | Which of 247 checks own unique invariants and when are they invoked? | proof deletion/consolidation | generated owner/invocation matrix |
| U-030 | Why are root/web packages independently locked and which Node versions are supported? | dependency drift | explicit deployment/build ownership decision |
| U-031 | Which env names are actually set in staging/production and read at build/runtime? | template cleanup | names-only deployment inventory matched to static reads |
| U-032 | What request-rate and payload bounds apply to every public HTTP/API/MCP route? | abuse/cost posture | route contract matrix and boundary fixtures |
| U-033 | What are audit/diagnostic/runtime retention and privacy rules? | unbounded growth and deletion conflict | policy plus age/cardinality histograms |
| U-034 | What is the actual operator dashboard read/query cost at realistic scale? | N+1 risk | isolated fixture with read/query budget |
| U-035 | What are product-data backup provider, cadence, retention, RPO/RTO, and tested restore steps? | disaster recovery | configuration evidence and isolated restore drill |
| U-036 | Which browser security headers are required by the threat model? | avoid cargo-cult header changes | documented baseline and automated response assertions |
| U-037 | Does the signed-in staging product complete all eleven journeys at the frozen commit? | static map is not runtime truth | bounded scripted/manual smoke with receipts |
| U-038 | Is the expanded semantic-platform thesis adopted? | prevents second normative plane | explicit adoption/redline/rejection |

## Next evidence slices

1. Convert the resolved U-011 ownership model into the smallest two-user shared-DM/community-content deletion fixture and fail-closed safety boundary.
2. Design the U-015/U-016 Builder Partner v3 terms, policy-version, and mixed-ledger migration proof; do not rewrite historical rows.
3. Inventory external consumers/configuration for U-025, U-028, U-031, and U-035.
4. Use isolated behavioral fixtures for U-009, U-014, U-017, U-023, scheduler fairness, and U-037.
5. Instrument legacy/auth compatibility reads before deleting paths whose row prevalence is now known.
