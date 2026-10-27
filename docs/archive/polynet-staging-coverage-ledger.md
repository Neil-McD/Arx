# Polynet staging coverage ledger

Updated October 15, 2026, at the integration checkpoint after 4A1.
This is the current index of bounded headless acceptance, derived from code,
checks, deployment observations and linked receipts. It is not a second source
of product state, a production release certificate or a claim of complete API parity.

## Checkpoint identity

| Boundary | Verified value |
| --- | --- |
| Reviewed cumulative diff | `origin/main` `0a100cfb544851ab06da25f93d8ad549db917ee4` -> `806aacca749e4fe59a88706510da5db365df1fa9` |
| Stack at review | 31 commits, 12 open draft PRs, #166–177; every PR head check rollup successful |
| Runtime / Git staging / served staging | `ac49ad2f8308b1ffec20dcc622fe6c332aad7a4b` |
| Staging backend | `dev:quick-porcupine-949`; last deployment provenance is in the 4A1 receipt, not remote SHA attestation |
| Production web, read-only observation | `91d28dc2c986ef88a8a507a269db710d6d28d878`, unchanged |
| Checkpoint changes | Documentation and sanitized evidence only, appended to #177; no additional PR or runtime deployment |

The reviewed diff contains 87 files: 20 runtime files (+744/-119 lines), four
manifest/lock files, eight test files, eight check/harness files and 47
documentation/evidence files. Those counts exclude this documentation checkpoint.
The docs/evidence volume is not runtime scope or a measure of product completion.

## Verification and review result

- [4A1 receipt-head CI passed](https://github.com/Neil-McD/Arx/actions/runs/38800562376).
  Its artifact tested GitHub merge commit `56997d8db091ddc8b0b359b27cece8ddb0cf35ca`,
  whose tree `7728a2a5ea955b2f74889210709aa528241d3e36` exactly matches reviewed
  branch head `806aacca749e4fe59a88706510da5db365df1fa9`. All 15 gate steps passed.
  This is merge-tree CI, distinct from the exact runtime candidate's local gate.
- The [4A1 receipt](../receipts/2026-10-15-staging-memory-consumption-4a1.md)
  retains that clean runtime gate: 1,865 tests / 194 files, both typechecks,
  build/browser checks and zero findings in both dependency audits.
- Fresh checkpoint execution: **344 tests / all eight changed test files passed**;
  cumulative whitespace validation passed. No source-pattern proof alone is
  counted as behavioral or live acceptance.
- Fresh read-only staging observations matched the complete bounded 4A1, 3A2,
  3A1 and retained 2A/2C fixture snapshots. This did not repeat OAuth, submit,
  admission, inference or outcome writes. It is preservation evidence, not a
  new end-to-end acceptance of every older journey on today's runtime.
- Cumulative source review found **no new blocking defect**. Reviewed auth
  deadlines/revocation, domain adapters, authority before replay, request identity,
  transactional effects, private projections, schema validation, dependency
  patches and changed proof assertions. No submitted independent review exists
  on #177; this checkpoint is the implementing agent's review.

[Sanitized checkpoint evidence](../receipts/evidence/2026-10-15-staging-integration-checkpoint.json).
Historical receipts retain their original source and deployment boundaries.

## Coverage against the trunk-down plan

“Bounded proof complete” closes the named acceptance, not every operation in its domain.

| Package | Current state | Remaining boundary |
| --- | --- | --- |
| 1. Baseline | Bounded proof complete | Future candidates still need source/deployment provenance; production remains separate |
| 2. Identity, authority and context | Bounded proofs complete: 2A, 2B1–3 | Other external clients and provider-wide grant/token revocation are not certified |
| 3. Independent client contribution | Bounded proof complete: 2C1 | No complete custom founder app, SDK or general recovery guarantee |
| 4. Community operations | Partial: 2C2–4 admission proofs complete | Create/fund, paid entry, restoration, channels/roles and lifecycle management need operation-specific external acceptance |
| 5. Collaboration and progress | Bounded loop complete: 3A1–2 | General workflow/form authoring and every action type are not externally accepted |
| 6. Intelligence usefulness | Partial: 4A1 consumption/reporting complete | Fresh source compilation/lifecycle (4A2), then governed outcome application/usefulness (4A3) |
| 7. Reference UI and distribution | Open | Founder journey parity before UI deletion; distribution follows demonstrated value |

Next slice: [4A2 fresh-source compilation and citation plan](polynet-staging-source-compilation-4a2.md).
**Execution is paused by the user for the [product-vision handoff](polynet-headless-agent-handoff.md).**
Planning found a preexisting standalone compiler-admission proof failure: its
mock interaction refs do not satisfy current source checks, and the check is not
in the release gate. Repair source-backed behavioral coverage before live 4A2.
This new finding does not rewrite the successful integration checkpoint or imply
fresh compilation acceptance.

## Accepted slices and their proof limits

| Slice / receipt | What the acceptance establishes | What remains outside it |
| --- | --- | --- |
| [1 — baseline](../research/package-1-staging-baseline-reconciliation-20261014.md) | Main-based staging reconciliation, stale ontology assertion fixed, dependency patches verified | Production parity or rollout |
| [2A — context](../receipts/2026-10-14-staging-context-2a.md) | Real member/builder context, resource traversal, private/cross-community denial and same-bearer membership revocation | Every object type or another client's compatibility |
| [2B1 — session](../receipts/2026-10-14-staging-session-2b1.md) | Truthful public web logout/session lifecycle | External OAuth grant revocation |
| [2B2 — external OAuth](../receipts/2026-10-14-staging-external-oauth-2b2.md) | Native Codex enrollment, continuity, refresh and local disconnect | Claude Code acceptance, provider-wide logout or old-token invalidation |
| [2B3 — auth cleanup](../receipts/2026-10-14-staging-auth-cleanup-2b3.md) | Body-inclusive deadlines, shared origin guard and session regression proof | Auth redesign or new provider configuration |
| [2C1 — contribution](../receipts/2026-10-14-staging-founder-contribution-2c1.md) | Attributed external contribution, exact-envelope replay and conflict handling | Full founder application or accepted-memory promotion |
| [2C2 — admission queue](../receipts/2026-10-15-staging-founder-admission-queue-2c2.md) | Bounded owner/admin queue/detail and native applicant denial | All administrative operations |
| [2C3 — approval](../receipts/2026-10-15-staging-founder-admission-approval-2c3.md) | One fresh free admission and safe retries | Paid entry, existing membership restoration or role changes |
| [2C4 — denial](../receipts/2026-10-15-staging-founder-admission-denial-2c4.md) | One denial, stable cooldown, replay and immediate re-entry denial; controlled-time expiry/reapplication tests | Elapsed live reapplication: not observed before `2026-10-22T17:55:59.047Z` |
| [3A1 — member progress](../receipts/2026-10-15-staging-member-progress-3a1.md) | Private pinned form submission and one evidence-backed automatic progress transition | Private answers becoming shared memory or generic workflow authoring |
| [3A2 — founder approval](../receipts/2026-10-15-staging-founder-progress-approval-3a2.md) | Approval against exact reviewed evidence with current authority and safe retries | Force moves, goal assessment or bulk approval |
| [4A1 — memory consumption](../receipts/2026-10-15-staging-memory-consumption-4a1.md) | Existing citation-backed memory read, truthful refusal, one synthetic observed outcome and retry recovery | Fresh learning, model use, customer benefit, outcome application or memory promotion |

## Supported surface versus remaining parity

The public agent interface remains five verbs: `polynet_list`, `polynet_read`,
`polynet_search`, `polynet_write`, `polynet_call`. A verb is not a promise that
every application operation is exposed. Application and agent adapters must
reuse the same canonical owners and current authorization.

| Surface | Current supported boundary / owner | Coverage disposition |
| --- | --- | --- |
| Identity and explicit community context | `authSessions`, `communityCapabilityContext`, canonical executor | Keep; bounded session/context receipts above |
| Contributions, channels and resources | Existing semantic repository and domain owners | Keep; selected read/write/privacy proof, not complete administration parity |
| Admission | `/builder/join-requests/`; `community.admission.approve` / `.deny` v1 -> `communityAdmin` | Keep; fresh free, observed-attempt decisions only |
| Private member forms | `/members/me/forms/`; `community.form.submit` v1 -> `communityFormRequests` | Keep; current self identity, activation, pinned version and revision |
| Founder progress decisions | Private workflow dossier; `community.workflow.approve_milestone` v1 -> `communityMemberWorkflows` | Keep; exact evidence observation and current manager/target access |
| Memory consumption and feedback | `/memory/`; `community.memory.record_outcome` v1 -> `communityIntelligenceDirectory` | Keep; external member visibility, citation/source checks, observed feedback |
| Compilation and outcome application | Existing evidence/digest/citation/compiler/metabolizer owners | Keep; local coverage exists; current end-to-end 4A2/4A3 acceptance remains open |
| Community creation/funding, paid entry, payouts, settings, roles and lifecycle | Existing domain owners | Keep; this stack does not establish complete external-client parity or fresh provider acceptance |
| Events, analytics, hosted/community agent execution, voice, discovery | Existing canonical projections and runtimes | Keep existing scope; no comprehensive new headless acceptance in this stack |
| Full founder application, outward event delivery or SDK | No new support claim from five verbs | Define a real journey before adding contracts; not an automatic requirement |

## Ranked residual work and deletion decisions

Step **1 — question and rank requirements** is complete for this checkpoint.
Ranking is qualitative; a numerical idiot-index ratio is not measured.

| Rank | Requirement or debt | Decision and credible minimum |
| --- | --- | --- |
| 1 | More slices without reviewing the cumulative stack | Checkpoint complete; keep one evidence index. Before main integration, review the final cumulative candidate and choose an explicit landing strategy for #166–177. No merge/rebase/squash occurred here |
| 2 | Call existing memory consumption “collective learning” | Reject that claim. Prove one fresh eligible source through current compilation/citation/retrieval, then outcome application in separate bounded slices |
| 3 | Unbounded node/edge directory queries | `listCommunityIntelligenceDirectoryViewCore` and `listCommunityIntelligenceEdges` call `.collect()` before limiting output. No first-party runtime caller was found outside their own module; a source proof references the edge export. **Deletion candidates requiring dependency/compatibility review and protected-memory confirmation**. If retained, plan indexed bounds/pagination. This is preexisting debt, not a 4A1 regression or an observed load failure |
| 4 | Rebuild or generalize the operation framework | No demonstrated need. Admission/form/approval deliberately commit receipt and effects in one mutation; memory uses domain deduplication across action/mutation uncertainty. Do not collapse those distinct transaction boundaries merely to remove similar receipt-shaped code |
| 5 | Duplicate active status documents | This ledger owns the current coverage index. Original plans and receipts remain dated history; remove their misleading current-next-step wording and link here |
| 6 | Replace the stack, add another permission store or delete the reference UI now | Exclude. Use current owners; prove missing founder journeys before migration or protected deletion |

No runtime deletion is justified by this checkpoint. Step **2 — delete** applies
only to superseded current-status instructions: remove the old baseline-next
pointer, retain dated evidence, and verify the links. No acceleration or
automation phase is claimed.

## Next bounded work

1. Review the proposed **4A2** plan linked above: repair the stale admission proof,
   then one fresh interaction -> bounded digest -> claimed Steward retention/
   citation -> authorized retrieval and source lifecycle. It specifies identities,
   fixture, a single funded run with the existing $1 reservation ceiling, and
   cleanup. No 4A2 live write or inference has been performed.
2. Reassess, then plan **4A3**: observed outcome -> governed application/metabolism
   -> correct future context. Synthetic success is not validated learning.
3. Close the remaining community-operation gaps individually; prove a complete
   founder-built journey before thinning reference UI or expanding distribution.

The stack remains draft and unmerged. Production backend/provider configuration,
canonical main and the production web deployment were not changed. This ledger
does not authorize a later release, paid inference, fixture mutation or cleanup.
