# Findings Register

Snapshot: `67c89903add41ff9b8de20929e07429a8d98f3bc`. Findings are analysis only. Priority is causal/risk importance, not implementation authorization.

For table compactness, `KEEP`, `DELETE`, and `DECISION REQUIRED` are exact shorthand for `KEEP (MVP core)`, `DELETE (deferred/dead)`, and `DECISION REQUIRED (user confirmation)`.

## Identity, access, and destructive lifecycle

| ID | Pri | Finding | Classification / action | Confidence | Cheapest falsifier |
| --- | --- | --- | --- | --- | --- |
| F-001 | P0 | **Resolved on staging:** actor provisioning now selects accounts only by indexed `authSubject`. The `O(U)` email fallback, local-only relink path, duplicate resolution preview, dead continuity payload, and unused users-email indexes were deleted without migrating user data. | `KEEP`; compatibility `DELETE` complete | behavioral and structural proof | `authActorSubjectAuthority.test.ts` |
| F-002 | P1 | Account-tier selection is separately implemented in `auth.ts`, `entitlements.ts`, and `gates.ts`; each collects/sorts history, `O(E log E)`. | `KEEP`; `CONSOLIDATE`, `BOUND` | confirmed source | one shared-resolver parity proof |
| F-003 | P0 | Two session-ID generators fall back to predictable `Math.random()` plus time if secure UUID generation throws. | `KEEP`; `HARDEN` | confirmed source | forced RNG-failure test requiring fail-closed behavior |
| F-004 | P0 | Browser logout clears the cookie and returns success after bridge revocation failure, potentially stranding a live server/provider session. | `KEEP`; `HARDEN`, `OBSERVE_FIRST` | source confirmed; consequence inferred | fake bridge failure and server-session assertion |
| F-005 | P1 | Revoked-session pruning is a secret-gated public mutation that scans all sessions; delete limit does not bound reads and no scheduled owner was found. | `KEEP`; `BOUND`, `HARDEN` | confirmed source | large fixture read-count proof |
| F-006 | P0 | Membership uniqueness is not schema-enforced; duplicate selection is `O(D log D)` and active-member cache counts rows, not distinct users. | `DECISION REQUIRED`; `OBSERVE_FIRST`, `MIGRATE_THEN_DELETE` | confirmed design; prevalence unknown | aggregate duplicate/count-delta audit |
| F-007 | P1 | Missing `communityMemberships.active` is interpreted as active, an access-critical legacy fail-open compatibility rule. | `DECISION REQUIRED`; `OBSERVE_FIRST`, `MIGRATE_THEN_DELETE` | confirmed source | redacted state/epoch distribution |
| F-008 | P1 | Join-request status is `v.string()` while code assumes a bounded state machine. | `KEEP`; `HARDEN` | confirmed source | grouped live status counts and writer literals |
| F-009 | P2 | `communities.memberOnboarding` is explicitly deprecated with no current static read/write path. | `DELETE`; `OBSERVE_FIRST`, `MIGRATE_THEN_DELETE` | strong static evidence | count rows containing field and migration receipt |
| F-010 | P0 | `deleteCommunity` performs global/wide collects and nested deletion in one mutation; cost grows with global checkout history plus all community state and has no resume receipt. | `KEEP`; `BOUND`, `HARDEN` | confirmed source | large interrupted fixture with retry/orphan proof |
| F-015 | P0 | `deleteOwnAccount` is one unbounded cross-domain mutation and does not encode a complete 125-table retention/deletion matrix. | `KEEP`; `BOUND`, `HARDEN` | confirmed source; completeness gap confirmed statically | generated foreign-key/ownership matrix plus synthetic fixture |
| F-016 | P0 | Account deletion deletes all messages, participants, typing rows, and conversation for every DM the user joined, erasing surviving participants' history. | `KEEP`; `HARDEN` | confirmed source | two-user DM deletion fixture |
| F-017 | P0 | Account deletion deletes shared community resources/events by `createdByUserId`, conflating contributor attribution with community object ownership. The accepted policy retains community state and anonymizes the deleted actor. | `KEEP`; `HARDEN`, `OBSERVE_FIRST` | confirmed source; policy resolved | shared-content fixture proving continuity and anonymization |
| F-018 | P0 | Canonical interaction schema declares privacy-purge request/completion events, but no workflow was found; account deletion touches legacy chat, not canonical interactions/evidence. The accepted policy requires explicit purge propagation. | `KEEP`; `HARDEN` | strong static evidence; policy resolved | implemented lifecycle and lineage fixture |
| F-019 | P1 | Anonymous-user cleanup scans users and hard-coded reference tables, has no scheduled/static first-party owner, and can drift as new user references are added. | `DECISION REQUIRED`; `OBSERVE_FIRST`, `MIGRATE_THEN_DELETE` | strong static evidence | live anon count/creator path plus generated FK comparison |
| F-020 | P1 | DM participants support `left`, but no normal leave/delete-conversation operation was found. | `KEEP`; `HARDEN` | strong static evidence | external caller inventory or direct function trace |
| F-021 | P1 | DM message deletion in account lifecycle does not explicitly clean storage objects referenced inside message content. | `DECISION REQUIRED`; `OBSERVE_FIRST`, `HARDEN` | inferred | inspect attachment encoding and storage orphan counts |

## Money and doctrine

| ID | Pri | Finding | Classification / action | Confidence | Cheapest falsifier |
| --- | --- | --- | --- | --- | --- |
| F-011 | P1 | Product docs/manifest still describe Workspace/thread as a current primary destination, contradicting communities-first MVP doctrine. | `DELETE`; `DOCUMENT`, `MIGRATE_THEN_DELETE` | confirmed doctrine drift | exact retained navigation/capability inventory |
| F-012 | P2 | Docs index labels community cognition “planned” while its active contracts/acceptance records say implemented. | `KEEP`; `DOCUMENT` | confirmed | reconcile index to executable proof owners |
| F-013 | P1 | “Project-bound workspace tools” is must-keep language, but whether it protects substrate, destination UI, or both is not explicit. | `DECISION REQUIRED`; `DOCUMENT` | confirmed ambiguity | human wording decision |
| F-014 | P1 | The attached expanded semantic thesis is broader/differently statused than the repository thesis and would create a second architecture plane if silently adopted. | `DECISION REQUIRED`; `DOCUMENT` | confirmed | explicit adoption/redline decision |
| F-022 | P0 | Builder Partner is active across seven dedicated tables, a 3.5k-line domain module, Connect/webhook/commerce/credit coupling, member/operator UI, legal terms, and two crons. It is now explicitly retained as a secondary capability, but current paid-tool economics and primary-surface coupling drift from that target. | `KEEP`; `CONSOLIDATE`, `MIGRATE_THEN_DELETE` | confirmed source; product decision resolved | v3 parity proof plus primary-surface inventory |
| F-023 | P0 | Daily advancement and monthly payout-cycle creation can continue creating obligations under the old policy. Retained payout machinery must distinguish historical obligations from new v3 eligibility. | `KEEP`; `HARDEN`, `VERSION`, `OBSERVE_FIRST` | confirmed source; product decision resolved | mixed-policy fixture proving prospective cutoff and old-ledger settlement |
| F-024 | P1 | `convex/billing.ts` adds ten registered aliases while source modules remain registered/callable. | `KEEP`; `CONSOLIDATE` | confirmed source | external/public call inventory and generated API parity |

## Interactions, resources, and intelligence

| ID | Pri | Finding | Classification / action | Confidence | Cheapest falsifier |
| --- | --- | --- | --- | --- | --- |
| F-025 | P1 | Canonical interactions coexist with legacy writer/link/attachment/backfill and legacy chat readers in archive/context/digest/cleanup paths. | `DECISION REQUIRED`; `OBSERVE_FIRST`, `MIGRATE_THEN_DELETE` | confirmed source/docs | live legacy reads/writes/data distribution and parity proof |
| F-026 | P1 | Weekly digest reads legacy chat messages rather than canonical interactions, so canonical-only activity can be omitted. | `KEEP`; `MIGRATE_THEN_DELETE` | confirmed source | canonical-only interaction digest fixture |
| F-027 | P1 | Resource body authority is dual: inline `communityResources.bodyMd` is read before intended `communityResourceContents`, and direct legacy reads remain. | `DECISION REQUIRED`; `OBSERVE_FIRST`, `MIGRATE_THEN_DELETE` | confirmed source | inline-body prevalence and reader parity |
| F-028 | P1 | Public resource-body compactor collects all community resources before slicing a bounded candidate batch; write limit does not bound read cost. | `DECISION REQUIRED`; `BOUND`, `MIGRATE_THEN_DELETE` | confirmed source | large-resource read-count proof and cursor design |
| F-029 | P2 | Optional raw `query` fields remain on evidence/intelligence retrieval logs although current writers omit them. | `DECISION REQUIRED`; `OBSERVE_FIRST`, `MIGRATE_THEN_DELETE` | confirmed schema/current writer | live non-null counts and retention decision |
| F-030 | P2 | `legacy_unversioned` intelligence evidence state remains a compatibility class for old nodes. | `DECISION REQUIRED`; `OBSERVE_FIRST`, `MIGRATE_THEN_DELETE` | confirmed source | count/migrate retained nodes and citation parity |

## Async fairness, transport, frontend, and operations

| ID | Pri | Finding | Classification / action | Confidence | Cheapest falsifier |
| --- | --- | --- | --- | --- | --- |
| F-031 | P0 | Six-hour community memory sweep repeatedly takes the first 500 communities with no cursor; suffix communities can starve forever. | `KEEP`; `HARDEN`, `BOUND` | confirmed source | >500 deterministic fixture proving eventual service |
| F-032 | P1 | Monthly AI-feed prune processes at most eight pages × 250 then restarts at null next month; no persisted continuation exists. | `KEEP`; `HARDEN`, `BOUND` | confirmed source | >2,000 community fixture across two runs |
| F-033 | P1 | Weekly digest selects recent prefixes by visibility with no cursor; older communities may never be evaluated. | `KEEP`; `HARDEN`, `BOUND` | confirmed source | >limit fixture across stable digest days |
| F-034 | P1 | Recurring reminder queries take bounded prefixes for each recurrence type without continuation; high cardinality can starve later events. | `KEEP`; `HARDEN`, `BOUND` | confirmed source | >limit recurring fixture with service receipts |
| F-035 | P1 | Native registry/platform surface and official MCP independently declare overlapping semantic schemas; MCP also carries legacy `workspace_*` compatibility names. | `KEEP`; `CONSOLIDATE`, `VERSION` | confirmed source | generated parity diff from one proposed semantic kernel |
| F-036 | P1 | Convex exposes source registered functions, 159 `community.ts` aliases, and 58 intermediate `communityExperience.ts` aliases; public identity is multiplied. | `KEEP`; `CONSOLIDATE` | confirmed source | client/external call inventory and API compatibility test |
| F-037 | P2 | `communityExperience.ts` has no clear first-party runtime owner beyond re-export/proof/generated references and is the cleanest facade deletion candidate. | `DELETE`; `OBSERVE_FIRST`, `MIGRATE_THEN_DELETE` | strong static evidence | external usage inventory and generated API diff |
| F-038 | P2 | Current Discover is communities-only, while `base.css` retains an unreferenced Apps/Skills marketplace style block. | `DELETE`; `OBSERVE_FIRST` | strong lexical evidence | production build plus screenshot/class coverage proof |
| F-039 | P1 | Workspace controllers build/navigate Workspace paths and set Workspace page state, while route parsing maps normal Workspace paths to Landing. | `DECISION REQUIRED`; `MIGRATE_THEN_DELETE` | confirmed source | refresh/deep-link behavior fixture and intended destination decision |
| F-040 | P2 | `App.tsx` (12k) and `base.css` (34.8k) concentrate multi-era state/styles; splitting before deleting deferred surfaces would preserve debt in more files. | `KEEP`; `DELETE_FIRST`, `DECOMPOSE_LATER` | confirmed concentration; causal conclusion reasoned | surface/call graph followed by post-deletion size profile |
| F-041 | P1 | Operator community list/overview/risk views collect all communities, perform per-community multi-query aggregation, and sometimes collect all audit events: unbounded N+1 work. | `KEEP`; `BOUND`, `CONSOLIDATE` | confirmed source | large-cardinality query/read budget proof |
| F-042 | P1 | No retention/prune owner was found for critical audit and platform diagnostic histories. | `DECISION REQUIRED`; `DOCUMENT`, `BOUND` | strong static evidence | external runbook/provider retention policy |
| F-043 | P0 | Canonical CI does not run web typecheck, production build, bundle budget, or browser journey; it predominantly proves structural source shape. | `KEEP`; `HARDEN`, `REWRITE_PROOF` | confirmed workflow | show another required branch-protection workflow or add controlled failing fixture |
| F-044 | P1 | 247 `check:*` commands and 207 source-reading proof scripts lack an explicit owner/lifecycle classification; redundant structural proofs amplify change cost. | `DECISION REQUIRED`; `OBSERVE_FIRST`, `CONSOLIDATE` | confirmed inventory | classify by CI/release/dev invocation and unique invariant |
| F-045 | P2 | Root/web use separate manifests/locks with duplicated dependency ownership, no workspaces, and no shared Node engine policy. | `DECISION REQUIRED`; `CONSOLIDATE`, `DOCUMENT` | confirmed source | explicit deployment-isolation/version ownership contract |
| F-046 | P1 | Env templates drift: model-map name differs from code, web documents old Daytona names, and runtime-v2 flag has no active read. | `DELETE`; `OBSERVE_FIRST`, `MIGRATE_THEN_DELETE` | confirmed static evidence | deployment env-name inventory and build/runtime read proof |
| F-047 | P2 | `.env.convex.quickstart.example` duplicates the main template with stale auth/runtime guidance and no first-party owner found. | `DELETE`; `OBSERVE_FIRST` | strong static evidence | operator/docs invocation inventory |
| F-048 | P0 | No concrete product-data backup/restore test, RPO, RTO, or regional recovery runbook was found; release rollback does not prove data recovery. | `KEEP`; `DOCUMENT`, `PROVE` | strong static evidence; external provider capability unknown | provider configuration plus isolated restore drill receipt |
| F-049 | P2 | Browser security headers are minimal and no documented header baseline exists. | `KEEP`; `HARDEN`, `DOCUMENT` | confirmed config; risk context unknown | header threat model and automated response assertion |
| F-050 | P0 | All 16 active staging Builder Partner rows carry v1 terms while current code requires v2 for new commission eligibility; only two matching standalone v1 legal receipts exist. Existing payout planning checks active status/financial readiness rather than current terms. v3 must preserve old obligations without treating stale acceptance as consent to new economics. | `KEEP`; `OBSERVE_FIRST`, `MIGRATE_THEN_DELETE`, `VERSION` | confirmed source plus complete staging aggregate; product direction resolved | legal-lineage reconciliation and mixed-policy payout fixture |

## Causal read

The first work is not CSS or file splitting. The upstream order is:

1. prove the shared-data deletion defect and stop the destructive path from running fail-open;
2. migrate Builder Partner prospectively to v3 community-only 4% economics while preserving old obligations;
3. implement the bounded deletion/privacy lifecycle, then make scheduled execution eventually fair and CI defend the real web product;
4. close canonical data migrations and collapse duplicate public/tool authority;
5. delete deferred routes/styles/docs/config and only then decompose/optimize the retained frontend.

## Staging falsification update

The bounded 2026-07-20 audit materially changes confidence and sequencing:

- zero duplicate memberships, zero missing `active`, zero deprecated `memberOnboarding`, and zero duplicate slugs were found in complete staging scans;
- 35 of 44 communities lack the active-member-count cache and two contain owner membership residue;
- auth sessions exceed 5,000; 4,718 of the bounded prefix are revoked;
- all four DMs are shared, confirming real blast radius for F-016;
- 67 legacy chat messages/links, two inline resource bodies, five raw-query retrieval receipts, and one legacy-unversioned intelligence node remain;
- Builder Partner contains active/payable/pending financial state described by F-022, F-023, and F-050; the capability is retained, so that state now requires versioned migration rather than wind-down;
- current staging is below the no-cursor cron thresholds, so F-031 through F-034 are latent scale defects rather than present starvation.

The post-audit F-001 slice rejected the initial migrate-first assumption. Email remains mutable profile data, while verified `authSubject` is the sole account-binding authority; the one observed missing derived `normalizedEmail` value therefore did not justify preserving or migrating an inactive relink mechanism.

Exact bounds and caveats: [`04-staging-shape-audit-20260720.md`](04-staging-shape-audit-20260720.md).
