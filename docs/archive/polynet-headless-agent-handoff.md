# Polynet: product vision and agent handoff

Prepared October 15, 2026 for an agent with no conversation history.
**4A2 is paused. The current assignment is orientation and handoff, not execution.**
This document explains the user's intended product and the work behind it.
The [coverage ledger](polynet-staging-coverage-ledger.md) remains the current
evidence index; this handoff does not create a competing status ledger.

## 1. The mission

**Polynet gives founders the trusted community infrastructure and collective
intelligence foundation to build their own AI-native products and experiences.**

The founder builds the experience. Polynet supplies the durable community state,
permissions, supported operations, shared context, progress and evidence underneath.
Humans and agents can participate in that same authorized world.

The destination is a **fully headless community platform**. A founder should be
able to use an LLM coding tool, build a custom application around supported
Polynet operations, and serve members without depending on Polynet's member UI
for that supported journey. The community can look and work the way its founder
wants while retaining Polynet's canonical access and intelligence guarantees.

“Vibeable” means the platform is understandable and composable enough for an
agent-assisted builder to make a useful custom product quickly. It requires
clear contracts, discoverable capabilities, predictable errors and reliable
recovery. It is not achieved merely by adding an AI chat box or publishing
internal database functions.

The test of success is concrete: **a founder can build and operate a useful
community experience on Polynet without rebuilding membership, permission,
evidence and collective-intelligence infrastructure. Members can contribute,
find useful context and make verifiable progress together.**

## 2. Customers, value and conceptual references

Intended customers include coaching businesses, expert networks, communities,
specialized businesses and collaborating teams. “Community” is the shared
institutional context: people, roles, knowledge, work, access and history. Its
experience need not resemble a conventional social feed.

Examples of founder-owned products:

- A coaching portal with custom onboarding, private assignments, founder review
  and a sourced community knowledge assistant.
- An expert network with its own matching, discussion and evidence views.
- A team workspace with custom channels, progress boards and decision context.

Slack helps describe collaboration; Linear helps describe progress; Skool helps
describe community participation and commerce. Palantir is a reference for
meaningful objects, relationships, actions and security; Obsidian for linked,
readable knowledge. These are conceptual references, not feature checklists or
commitments to reproduce their scope.

Earlier research also examined Whop, HYROS and other specialist platforms for
mechanisms that let customers build around trusted infrastructure. Do not infer
that those companies are wholly headless or that their current APIs match ours.
No new competitor research was performed for this handoff.

The stack analogy is useful: Convex supplies general backend infrastructure;
Polynet builds a more specialized community and intelligence domain above it;
founders build specific products above Polynet. The commercial hypothesis is
that these domain guarantees reduce founder effort and improve member outcomes.
Pricing power, retention, network effects and useful collective learning still
need evidence; a higher position in the stack does not establish them.

## 3. Product priorities

| Priority | Product layer | Purpose |
| --- | --- | --- |
| 1 | Ontology, context and collective intelligence | Make community knowledge and activity understandable, sourced, permissioned and reusable by people and agents |
| 2, closely coupled | Community operations | Establish identity, membership, access, funding, commerce and lifecycle truth |
| 2, closely coupled | Collaboration and progress | Let people contribute, coordinate, provide evidence and move through verified work |
| 3 for now | Discovery and distribution | Help eligible participating communities be found and acquire members |

The user considers community operations at least as important as collaboration
and progress, and possibly more important. Execution starts with access and
authority because other layers depend on them; this does not demote ontology
as the central product priority.

Private or unlisted communities must be valuable without Discover. Discovery
should grow in importance over time. Listing must not make private knowledge
public or bypass admission, and distribution is not a traffic guarantee.

## 4. The ownership boundary

| Responsibility | Polynet owns | Founder owns or chooses |
| --- | --- | --- |
| Identity and community access | Verified identity, canonical membership/roles, entitlement and revocation | Login presentation, onboarding design and application navigation through supported identity flows |
| Community operations | Validated community state, admission, lifecycle, supported governance and commerce operations | Branding, positioning and the experience around those operations |
| Collaboration | Canonical contributions, channel access, privacy, attribution and supported event state | Feed, chat, forum, calendar, dashboard and other interaction layouts |
| Progress | Supported workflow/form objects, pinned evidence, authorized transitions and receipts | Program design, custom boards, coaching journeys and additional domain orchestration |
| Ontology/context | Stable supported objects and relationships, authorized representations and current context | Domain vocabulary, custom views and additional application-specific data |
| Intelligence | Eligible evidence, governed retention, citations, authorized retrieval and outcome lineage | How the product presents and applies that context within allowed authority |
| Agents | Supported hosted services and the official external agent interface, with explicit actor/authority boundaries | Custom agent UX, external harness, external model and compute choices |
| Distribution | Eligible community discovery and trustworthy admission destination | Marketing website, acquisition strategy and positioning |
| Reliability | Canonical effects, concurrency/retry rules, audit, usage and financial evidence | Application engineering and its own infrastructure/availability obligations |

Founder autonomy concerns the experience and application logic. It does not let
custom code change Polynet membership, payment truth, privacy or accepted memory
by assertion. A founder may keep an additional backend and database; it must not
become a second authority for Polynet-owned facts.

External model choice is compatible with this vision. Current Polynet-hosted
inference has its own fixed funding/model rules; the vision is not authorization
to change them, run arbitrary hosted code or create a general agent marketplace.

## 5. What headless means for the web application

The end state allows a complete supported founder experience without mandatory
Polynet member screens. An optional Polynet reference app, founder/operator
controls, authentication surfaces and shared Discover are compatible with that
goal. Current web journeys remain necessary until replacement parity and
migration are proved.

Retain React/Vite as the current reference renderer. Separate business truth
from presentation through existing domain owners; thin UI dependencies one
verified journey at a time. A frontend framework replacement has not been
justified by this work. LLM usability depends primarily on clear contracts,
types, code boundaries and deterministic behavior.

## 6. The irreducible platform model

```text
State       = canonical objects + relationships + current policies
Operations  = authorized attempts to change state or cause effects
History     = durable evidence, events, versions and receipts

Experience  = a permissioned projection of these for one actor and task
```

An ontology gives supported objects stable identity, meaning, relationships,
lifecycle and available actions. It is more than a vector index or a collection
of documents. Current scope is a bounded community ontology; arbitrary
founder-defined object schemas and unrestricted graph queries are not established.

Context selects relevant state/history for one invocation: who is acting, whom
they serve, the explicit community, current access, task, available operations
and evidence. A prompt, selected path or UI state cannot grant authority.

Cloud records remain canonical. Markdown/JSON projections make those records
understandable to models and clients. They are not a second database. Binary
artifacts retain binary storage with addressable identity, metadata and access.

## 7. Endpoints and capability families

The user's request for “endpoints” means stable supported building blocks for
applications and agents. Design these around user outcomes and canonical domain
owners. Screen names and internal function counts are not an API specification.

This is the responsibility inventory, **not a claim that all rows already have
complete supported external endpoints**:

| Family | Invariants Polynet should provide | Founder-built experiences |
| --- | --- | --- |
| Identity, sessions and actor context | Authenticated identity, continuity, logout, explicit actor/community scope | Login/account UX |
| Community lifecycle and configuration | Create/manage/publish/unlist/archive/restore subject to canonical rules | Setup wizards and settings pages |
| Membership and admission | Requests, approval/denial, membership, roles, leave/remove/block and current access | Applications, member directories and admin tools |
| Channels and collaboration | Channel identity/grants, contributions/replies, attribution and authorized lifecycle | Chat, forum and activity experiences |
| Private communication and attention | Participant privacy, read state, bounded presence/typing and delivery state | Inbox and attention UX |
| Resources and source intake | Curated content, publication/version authority, authorized uploads/imports | Courses, libraries, editors and custom content presentation |
| Ontology and context | Stable supported references/relationships, self/member/builder lenses, bounded retrieval | Custom knowledge navigation and domain views |
| Collective intelligence | Eligible evidence, bounded compilation, governed memory, immutable citations, outcome linkage | Knowledge assistants and domain intelligence experiences |
| Progress and forms | Pinned versions, assignments, private evidence, current stage visits and verified decisions | Coaching programs, boards and specialized workflows |
| Agent services | Explicit personal/community actor separation, supported runs/context/cancellation, usage controls | External agents and custom agent interfaces |
| Calendar and product events | Authorized events, instants/timezones, occurrences and cancellation | Calendar and scheduling interfaces |
| Commerce and funding | Provider-verified billing/entitlement, founder funding, connected payouts, reconciliation | Pricing/checkout presentation within supported commerce flows |
| Discovery and distribution | Eligible listing, community presentation and canonical admission destination | Marketing sites and acquisition journeys |
| Analytics and operation history | Evidence-backed metrics, audit, receipts, usage and financial records | Dashboards and reports |
| Delivery and operations | Supported notifications, bounded recurring work, retention and recovery responsibilities | Notification presentation and approved integration behavior |

Settings composes configuration operations. Create Community is lifecycle.
Analytics projects canonical evidence. Calendar events are distinct from
operation/audit events. Durable event history does not imply an implemented
public webhook subscription service. Add an SDK, generic event bus or outward
delivery contract only for a demonstrated client need.

For each supported operation, specify identity/version; principal and target
scope; input/output/error schemas; current authority; state/revision preconditions;
pagination/payload bounds; effects; idempotency/conflicts/recovery; audit receipt;
and positive, denial/stale and retry acceptance. Credentials remain server-bound.
Reuse one canonical owner across all adapters.

### Current agent interface

The official MCP and native agent projections share five verbs:

| Verb | Meaning |
| --- | --- |
| `polynet_list` | Enumerate an authorized directory |
| `polynet_read` | Read an exact authorized object representation |
| `polynet_search` | Search an authorized subtree and return follow-up paths |
| `polynet_write` | Write a naturally writable supported object with retry identity |
| `polynet_call` | Invoke an exact discovered, versioned capability |

External clients discover communities and returned paths, then discover the
selected community's `capabilities/`. Paths select objects; the server derives
authority on every request. Current examples include channel participation,
resource changeset staging, memory outcome reporting, private form submission,
bounded admission approval/denial and exact-evidence milestone approval.

Five verbs are an economical agent interface, not proof of complete application
coverage. Current first-party Convex RPCs are not automatically a supported
external application API. An application adapter may use a different typed wire
shape while sharing the same domain owner, authorization, effects and receipts.

The source contracts are [canonical operations](../canonical-platform-operation-contract-v1.md)
and [official MCP](../polynet-workspace-mcp-contract-v0.md); code owners are
`shared/polynetCanonicalToolContract.ts`, `convex/polynetCanonicalExecutor.ts`
and `convex/communityCapabilityContext.ts`.

## 8. Agents and collective intelligence

A human member, that member's personal agent, a community-owned agent, an
external harness and trusted infrastructure have different roles. Preserve actor,
authority, credit, subject and origin separately. A model or transport is not
automatically a new community member or credited author.

- Personal/external actions use the authenticated human's current authority.
- The community Concierge is mounted to one community and cannot inherit its
  sponsor's builder privileges.
- The internal Steward is the single bounded cognition role, operating on exact
  claimed compiler work. It is separate from a member's private assistant.
- Independently enrolled agent members/service principals are future design,
  not current user-based membership behavior.

The intended intelligence loop is:

```text
shared activity / published resources
  -> currently eligible source evidence
  -> versioned trace and bounded compiler digest
  -> governed retain / carry-forward / dismiss decision
  -> accepted memory with immutable source citation
  -> authorized retrieval and action
  -> observed outcome tied to that consumption
  -> governed update and better future context
```

The intended benefit is that one person's useful contribution can improve a later
person's outcome when evidence and permissions allow reuse. Every arrow needs
proof. Raw storage, search results, a summary, a returned context body and one
synthetic “worked” report establish different things. Accepted status is not
automatic factual certainty. Source editing/revocation must affect current reuse.

Private form answers, DMs and personal-agent histories do not automatically
become shared intelligence. Cross-community learning is not permission to pool
private community data. The full fresh-learning/usefulness loop remains unproved
by the staging work below.

## 9. Roadmap and what the recent work was for

There are three levels of labels. The original whole-platform inventory had
**28 detailed chunks**; the later trunk-down approach grouped work into **seven
execution packages**; labels such as 2B3, 3A2 and 4A1 identify bounded slices.
These numbers are not interchangeable or a completion percentage.

The seven-package order is baseline -> identity/context -> independent client
contribution -> community operations -> progress -> intelligence usefulness ->
reference-UI thinning/distribution. Packages overlap as dependency proofs become
available; selected admission proofs do not close every community operation.

The original inventory ensures these responsibilities are not forgotten:

| IDs | Detailed scope |
| --- | --- |
| C01–C03 | Baseline; identity/session/authority; ontology/context contract |
| C04–C08 | Founder funding/create; member commerce/admission; membership/channel governance; archive/restore; retention/deletion/export |
| C09–C12 | Contributions; private communication/attention; resource authority; source ingestion/media |
| C13–C16 | Compiler/cognition; accepted memory/retrieval/outcomes; agent conversation lifecycle; skills/configuration/voice |
| C17–C20 | Verified progress; versioned private forms; calendar; notifications/digests |
| C21–C24 | Recurring work/cost/operator evidence; external adapters; independent founder experience; reference web app |
| C25–C28 | Analytics; discovery/distribution; retired data/schema closure; backup/restore/operating handoff |

This is an inventory of responsibilities and evidence gaps, not an instruction
to build 28 new systems. Existing mechanisms may satisfy a chunk. Verify them
before adding abstractions.

Recent staging work has established bounded proofs for baseline reconciliation,
web session/logout, native Codex OAuth continuity, authorized context and denials,
one attributed external contribution/retry, admission queue/free approval/denial,
private form submission, evidence-backed automatic progress, founder approval,
and existing-memory consumption with truthful synthetic outcome/retry handling.

The integration checkpoint reviewed the cumulative stack, passed 344 tests in
the eight changed test files, confirmed prior bounded snapshots and recorded no
new blocking finding. Its final CI passed all 15 gate steps. These are staging
proofs, not production rollout, a complete independent founder app, exhaustive
security/load certification or validated learning.

The subsequent 4A2 planning investigation found a **preexisting red standalone
compiler-admission proof** whose fake interaction references fail current source
checks. It is not in the release gate. A passing release gate did not cover that
script. Preserve strict source checks and repair meaningful behavioral coverage
before future live compilation.

4A2 is planned, **not implemented and now paused**. Its proposed proof uses one
fresh human source, one real claimed Steward run with the existing $1 reservation
ceiling, authorized citation-backed retrieval, then source edit/tombstone denial.
Its detailed [plan](polynet-staging-source-compilation-4a2.md) owns fixture and
execution boundaries. This handoff does not resume or authorize that inference.
4A3 would later address governed outcome application and usefulness.

Other open gaps include full founder create/fund/admin lifecycle parity, paid
commerce acceptance for custom clients, broader client compatibility, complete
source lifecycle/learning proof, a full founder-built journey and operating
recovery. Live seven-day reapplication remains unobserved until the recorded
October 22 deadline or later. Preexisting unbounded directory queries are tracked
for dependency/compatibility review; no broad cleanup was authorized.

## 10. Repository and staging handover

Observed October 15; recheck before relying on these identities for new work.

| Item | Location / identity |
| --- | --- |
| Repository | `Neil-McD/Arx`; local project `/Users/neilmcdevitt/code/arx` |
| Authorized staging worktree | `/Users/neilmcdevitt/.codex/worktrees/chunks-1-3-staging/arx` |
| Current branch | `codex/staging-memory-consumption-4a1` |
| Source before this handoff | `bb7d7b7db886a07f32d69a1e64c3c4b321ea9517`; local 4A2 plan commit, not pushed |
| Latest pushed checkpoint | `88ffb2ae0c7b8226b032bec572500e09fecd5606`; [draft PR #177](https://github.com/Neil-McD/Arx/pull/177) |
| Canonical main | `0a100cfb544851ab06da25f93d8ad549db917ee4` |
| Runtime / Git staging / serving web | `ac49ad2f8308b1ffec20dcc622fe6c332aad7a4b`; `https://polynet-staging.vercel.app` |
| Staging Convex / MCP | `dev:quick-porcupine-949`; `https://polynet-staging.vercel.app/runtime/mcp` |
| Staging selector | `/tmp/polynet-package-1-staging.env`; validate that it selects staging; do not copy secrets into docs |
| Production web / backend | Web `91d28dc2c986ef88a8a507a269db710d6d28d878`; backend `prod:wry-hawk-715`; no production change authorized |
| PR stack | Twelve open draft PRs #166–177, unmerged; main integration strategy remains separate |
| Stack | TypeScript; React 18.3.1; Vite 8.1.1; Convex 1.42.1; Vercel web/gateways, WorkOS AuthKit and Stripe commerce |

Backend deployment provenance and a serving frontend SHA are separate evidence.
The 4A1 receipt records the last explicit backend deployment; no remote backend
SHA attestation is claimed. Later commits contain documentation rather than a
new serving runtime. Latest green CI belongs to the pushed checkpoint, not the
later local planning/handoff documents.

The root checkout has old uncommitted work and conflicts. Do not reset, clean or
use it as the current staging candidate. The earlier research worktree,
`/Users/neilmcdevitt/.codex/worktrees/headless-vision/arx`, also has uncommitted
vision/research documents; preserve them. Its original surface map and references
informed this handoff but are not merged runtime truth or required dependencies
for understanding this document.

Some older product prose in `PLATFORM.md` emphasizes agents-as-products and the
community as their distribution layer. The latest user direction here is broader:
founder-owned experiences on headless community and intelligence rails. Read old
prose with its implementation/date boundaries; it does not establish full
headless capability or override the user's present vision. A memory note names
`mcp-harness-projection-contract-v0.md`, which is absent in this staging checkout;
use the current canonical operation/MCP contracts linked above.

## 11. How the receiving agent should work

1. Read this handoff, the actual worktree's `AGENTS.md`, the
   [semantic platform thesis](../agent-native-semantic-platform-thesis.md),
   [coverage ledger](polynet-staging-coverage-ledger.md) and relevant operation
   contracts. Verify refs, worktree status and source before changing anything.
2. Keep the distinction between user vision, proposed architecture, implemented
   code, local behavior, staged acceptance and production evidence. Update the
   single coverage index rather than making a competing milestone ledger.
3. Apply the Elon algorithm sequentially. State the current step; first question
   requirements and rank avoidable effort, then delete/verify, simplify/verify,
   accelerate/verify and only then automate a proven process. Do not present all
   five as a checklist completed by writing a plan.
4. Favor one canonical flow and domain owner. Keep deterministic authorization,
   privacy, entitlement, source validity, idempotency and receipts outside model
   discretion. Models may interpret meaning; prompts never grant authority.
5. Keep slices small and reversible, with explicit positive, denied/stale and
   retry proof. Preserve prior fixtures/audits. No new framework, graph database,
   permission service, workflow builder or agent role without demonstrated need.
6. Production remains untouched. Do not merge, deploy, change provider settings,
   run inference or mutate fixtures merely because an old plan exists. Read the
   actual release runbook for any later separately authorized release. Protected
   harness/compiler/resources/memory deletion retains the human-confirmation
   boundary in `AGENTS.md`.
7. The user prefers clear first-principles synthesis grounded in code and live
   evidence, concise lists/tables and concrete next slices. Ask necessary questions
   in ordinary chat; do not use question pop-ups. Do not repeat permission requests
   for work already authorized. The current pause still governs 4A2 execution.

The decision rule for future work is: **Does this make it easier for a founder
to build a useful custom experience on trustworthy shared community state and
intelligence, while keeping the platform irreducibly simple, scalable, reliable,
robust and secure?**
