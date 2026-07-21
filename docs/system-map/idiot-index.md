# Elon Algorithm and Idiot Index

The index rates the **requirement or compatibility burden**, not the value of a file or the intelligence of its author. `10` means “challenge/delete first”; `0` means physically or contractually irreducible. High score is not deletion authorization.

## Ranked challenge queue

| Score | Exact requirement or burden | Classification | Owner | Blunt reason | Safe disposition |
| ---: | --- | --- | --- | --- | --- |
| 10 | one account deletion transaction may erase all shared DMs | `KEEP (MVP core)` | privacy/DM | destroys another person's history to simplify one user's deletion | replace with participant departure/redaction lifecycle |
| 10 | one transaction must delete an account or community across all domains | `KEEP (MVP core)` | lifecycle | unbounded irreversible work with no resume point is indefensible | phase, cursor, receipt, root-last finalization |
| 10 | insecure randomness is an acceptable session availability fallback | `KEEP (MVP core)` | auth | a credential identifier must fail closed | remove fallback and prove failure behavior |
| 10 | mutable email should scan for or implicitly rebind a Polynet account | `DELETE (deferred/dead)` | auth | email is profile data; verified subject is account authority, and global scans make login cost grow with every user | deleted on staging with subject-authority behavior proof |
| 10 | unreferenced Discover Apps/Skills CSS belongs in MVP | `DELETE (deferred/dead)` | frontend | explicitly deferred surface with no static consumer | build/screenshot proof, then delete |
| 10 | reliability can omit a tested product-data restore path | `KEEP (MVP core)` | operations/data | rollback without recoverable data is not reliability | define RPO/RTO and perform isolated restore drill |
| 10 | paid-tool usage should create new Builder Partner commissions | `DELETE (deferred/dead)` | product/finance | target economics explicitly remove it and it cross-couples two unrelated economies | stop prospectively under v3; preserve historical ledger evidence |
| 10 | a magic join-request message should own platform-home autojoin preference | `DELETE (deferred/dead)` complete | access | one relationship was represented by membership plus a hidden second authority with sorting and cleanup branches | deleted on staging lane; inactive membership now owns autojoin intent |
| 9 | the same 500 communities may be the memory sweep forever | `KEEP (MVP core)` | cognition operations | bounded prefix processing masquerades as eventual service | durable cursor/partition plus fairness proof |
| 9 | weekly digest may describe canonical activity using legacy chat only | `KEEP (MVP core)` | communications | current product writes can be absent from its own digest | migrate reader to canonical interactions |
| 9 | operator dashboards may scan/re-query the whole product per view | `KEEP (MVP core)` | operations | diagnostics should not become a scaling incident | indexed windows/materialized bounded projections |
| 9 | web launch CI need not build/typecheck the web app | `KEEP (MVP core)` | engineering/release | canonical gate does not defend the shipped artifact | add build/typecheck and one vertical journey |
| 9 | `communityExperience.ts` needs a registered intermediate public facade | `DELETE (deferred/dead)` | backend transport | adds 58 public identities without owning semantics | external usage check, migrate aliases, delete |
| 9 | stale env templates/flags are useful “just in case” | `DELETE (deferred/dead)` | operations | false configuration contracts cause deployment drift | compare deployed names, remove/update together |
| 9 | Workspace is a primary product destination during community-first MVP | `DELETE (deferred/dead)` | product/frontend | explicit doctrine says substrate, not destination | decide compatibility, migrate callers, retire route/UI |
| 9 | Workspace/onboarding should contain primary Builder Partner product UI | `DELETE (deferred/dead)` | frontend/product | a retained secondary growth capability should not distort the core community journey | retain minimum Settings/operator controls only |
| 9 | creator attribution grants account deletion ownership over shared community content | `KEEP (MVP core)` | privacy/community | leaving a community must not silently destroy its knowledge | transfer continuity to community and anonymize the actor |
| 9 | a public funnel may reuse admission from another principal, route, or older request | `DELETE (deferred/dead)` complete for access and join/cancel | access/frontend | stale or blocked authority must never produce an enter, join, request, cancel, or bridge action | load and join/cancel route/intent/subject/generation binding now fail closed; duplicate access, resume, optimistic-request, `primary_cta`, and preview lookup owners deleted |
| 9 | every checkout-start retry may create another local and Stripe session | `KEEP (MVP core)` | billing/frontend | an external financial side effect needs caller-owned idempotency and a current-response boundary, not button-state hope | one server attempt key per user/community/plan intent; replay returns the same live session and stale browser responses cannot redirect |
| 8 | new Builder Partner community commissions should remain 5% | `DELETE (deferred/dead)` | product/finance | accepted prospective model is 4%; old obligations cannot be rewritten | version v3, change only new eligible accrual |
| 8 | canonical and legacy community interaction stacks should coexist indefinitely | `DECISION REQUIRED (user confirmation)` | interactions | migration residue doubles readers, lifecycle, and privacy scope | finish read migration and delete residue |
| 8 | resource metadata row and content row may both own the body | `DECISION REQUIRED (user confirmation)` | resources | dual read authority makes migration and privacy ambiguous | bounded migrate, single reader, remove fields |
| 8 | every source module, `community.ts`, and `communityExperience.ts` should remain publicly callable | `KEEP (MVP core)` | backend API | transport identity multiplies without product value | one supported public identity per operation |
| 8 | route parser and controllers may disagree about Workspace | `DECISION REQUIRED (user confirmation)` | frontend routing | refresh and in-memory navigation are different products | one route state machine after destination decision |
| 8 | hundreds of structural proof scripts may persist without owners | `DECISION REQUIRED (user confirmation)` | engineering | check count is bureaucracy unless each owns a unique invariant | classify/merge/delete; preserve behavioral proof |
| 8 | `App.tsx` should be decomposed before obsolete surfaces are removed | `DECISION REQUIRED (user confirmation)` | frontend | spreads dead complexity into more files | delete surfaces and consolidate state first |
| 8 | anonymous-user deletion can rely on a hand-maintained reference list | `DECISION REQUIRED (user confirmation)` | identity/privacy | table growth silently invalidates safety | inventory live state and replace/delete cleanup |
| 8 | recurring bounded prefix scans are “done” without continuation | `KEEP (MVP core)` | async operations | later eligible work can starve permanently | cursor/partition/service-level proof |
| 8 | duplicate membership rows should be silently ranked and tolerated | `DELETE (deferred/dead)` | access | choosing a winner hides authority corruption and makes access order-dependent | one indexed pair resolver; fail closed and keep creation in one transaction |
| 7 | three entitlement-history algorithms are safer than one | `KEEP (MVP core)` | access/billing | repeated policy data resolution invites drift and repeated sorting | one bounded resolver with parity proof |
| 7 | missing membership `active` should mean active forever | `DELETE (deferred/dead)` | access | legacy compatibility was fail-open on an authorization row with zero staging dependents | deleted on staging; explicit true is schema-required and behaviorally enforced |
| 7 | native and official MCP transports each need independent semantic truth | `KEEP (MVP core)` | capabilities | wire contracts differ; capability meaning/authority should not | shared semantic kernel, versioned adapters |
| 7 | raw retrieval query legacy fields belong indefinitely | `DECISION REQUIRED (user confirmation)` | intelligence/privacy | current writers omit them and privacy benefit is low | count/scrub/remove after retention decision |
| 6 | `billing.ts` and source modules both need public registered names forever | `KEEP (MVP core)` | billing API | compatibility may exist but permanent duplication is unowned | inventory external callers and consolidate |
| 6 | legacy `workspace_*` MCP names are permanent domain vocabulary | `DECISION REQUIRED (user confirmation)` | official MCP | current wire compatibility is real, internal semantic drift is not | version and deprecate externally, normalize internally |
| 6 | join requests may store arbitrary status strings | `DELETE (deferred/dead)` complete | access | required workflow had an unnecessary invalid-state space | staging enumerated and migrated; schema now permits only `pending \| denied` |
| 5 | root and web require independent manifests/locks forever | `DECISION REQUIRED (user confirmation)` | build/release | could be deployment isolation, but no policy explains version drift | choose workspace or explicit independent ownership |
| 5 | expanded semantic-platform thesis is present-day authority | `DECISION REQUIRED (user confirmation)` | product architecture | valuable long-term input is not current executable contract | adopt/redline/reject in one canonical doc |
| 3 | workspace/tool credit accounting exists although Workspace UI is deferred | `KEEP (MVP core)` | harness/economy | protected execution still consumes real provider cost | retain bounded accounting; detach UI assumptions |
| 2 | Builder Partner exists as a secondary growth capability | `KEEP (MVP core)` | product/finance | current direction retains it and the ledger has real obligations | simplify economics and prominence; harden versioned payout |
| 2 | external provider-specific source adapters exist | `KEEP (MVP core)` | resources/integrations | Drive, GitHub, file, and URL acquisition differ physically | converge on one canonical source contract |
| 2 | runtime/audit receipts exist | `KEEP (MVP core)` | operations | required for recovery and accountability | keep with bounded retention and privacy rules |
| 1 | private apps, skills, and official MCP capability exist | `KEEP (MVP core)` | platform | explicitly required external/community capability | retain and harden authority/OAuth lifecycle |
| 1 | coding/community harness and workspace substrate exist | `KEEP (MVP core)` | protected runtime | explicitly protected, regardless of destination UI | retain; remove only proven UI/compatibility residue |
| 1 | account/community deletion capability exists | `KEEP (MVP core)` | privacy/lifecycle | required job; only the current algorithm is wrong | rebuild as safe lifecycle |
| 0 | verified identity and fail-closed actor resolution | `KEEP (MVP core)` | auth | no secure multi-user product exists without it | retain and behaviorally prove |
| 0 | one community owner/membership/entitlement authority path | `KEEP (MVP core)` | access | gated communities physically require it | retain, enforce invariants, remove duplicates |
| 0 | canonical interaction/resource/evidence/intelligence spine | `KEEP (MVP core)` | community intelligence | this is the collective-intelligence product | protect, close migrations, optimize last |
| 0 | separate member agent and community-owned agent principals | `KEEP (MVP core)` | agent architecture | different authority and ownership make separation necessary | retain and audit every turn/effect |
| 0 | provider-verified payment and ordinary creator payout | `KEEP (MVP core)` | commerce | required paid access and builder value flow | retain idempotency/reconciliation proofs |

## Deletion readiness tiers

### A — static candidates, nearly ready

- Discover Apps/Skills CSS with zero source references.
- stale quickstart env template and no-op flags/names after deployment-name confirmation.
- stale docs/index wording.
- intermediate `communityExperience.ts` facade after external/API compatibility inventory.

### B — migrate, observe zero, then delete

- legacy interaction writer/link/attachment/backfill/read stack;
- inline resource body fields and compactor;
- raw retrieval query fields and legacy evidence states;
- duplicate public Convex aliases and legacy MCP wire names;
- standalone Workspace route/controller/UI state.

### C — decision and liability/retention plan first

- pre-v3 Builder Partner legal/ledger reconciliation and exact retention periods;
- exact financial/legal/audit/backup retention periods;
- privacy purge, audit retention, and legal evidence preservation;
- anonymous accounts and cleanup path;
- package topology and semantic-thesis adoption.

### D — protected core; simplify internally, do not delete

- auth/access, communities/funnel, canonical interactions, resources/memory/compiler/intelligence;
- member/community agents, private apps/skills, official MCP;
- coding/community harness and runtime receipts;
- provider-verified access billing and ordinary creator payout.

## Elon algorithm order

Question doctrine -> delete deferred obligations/surfaces -> close data migrations -> collapse duplicate authority and transport -> simplify lifecycle/state -> harden/bound retained paths -> optimize frontend/query/runtime performance -> accelerate delivery -> automate only with fairness and receipts.
