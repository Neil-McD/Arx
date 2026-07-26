# PC3B Revoked-Evidence Read Compatibility — 2026-07-24

- Status: `COMPLETE`; PC3 remains in progress
- Job: P27 immediate fail-closed revocation across derived intelligence
- Current production source, remote `main`, and live web marker:
  `1a71a459e5f7b2099fa85861680642b4d7c71cc4`
- Staging source, remote staging branch, and live web marker:
  `9331f446b47285b1b14ddd6d04998e683f0184de`
- P27 staging commit: `9331f446b47285b1b14ddd6d04998e683f0184de`
- P27 parent: `0e9cbc8a454c33a6ba61a222065ad43b4802dc61`
- Production data, provider state, and private content read: none
- Product code, schema, runtime, data, provider, integration, deployment, and
  production changes: none

## 1. Irreducible requirement

Once a canonical source is no longer readable, no retained derived copy may
continue returning its copied content.

```text
canonical interaction, Resource, AI Feed, or source trace
  -> source trace and immutable citation
  -> intelligence node, edge, digest, or change request
  -> native member agent, official MCP, manager, public graph,
     community agent, or compiler handoff
```

The read must re-resolve current canonical truth before returning derived
content. Asynchronous evidence synchronization, later physical purge, or a UI
refresh cannot be the immediate security boundary.

P27 is containment, not erasure. It does not authorize C2.3B2 physical scrub,
add a revocation table, or claim that every retained copy has been deleted.

## 2. Current truth and isolated change

Remote refs and public build markers were refreshed during PC3B:

| Layer | Exact value |
| --- | --- |
| current worktree | `/Users/neilmcdevitt/code/arx/.worktrees/semantic-platform-staging-20260719` |
| branch / HEAD | `codex/semantic-platform-staging-20260719` / `9331f446...` |
| local `main` | stale `e3386dea...` |
| remote and local `origin/main` | `1a71a459...` |
| live production web | `1a71a459...` |
| remote and live staging web | `9331f446...` |
| merge base | `a936dee7...` |
| divergence | 6 production-only / 119 staging-only commits |

The P27 commit adds 1,125 lines and removes 91 across 16 files:

- 223 lines: one new derived-evidence readability module;
- 493 lines: one end-to-end behavioral fixture;
- 284 net runtime lines across community intelligence, compiler digest,
  heartbeat, and agent filesystem readers;
- remaining lines: contracts, tracker updates, package script, and foundation
  test registration.

The four pre-existing runtime files, canonical evidence resolver, citation
checker, and source-trace revision helper at P27's parent are byte-identical to
current production. P27 changes no schema. This is unusually favorable source
compatibility: the security patch was built directly over the same runtime
source now in production.

It is still not a wholesale release candidate. The commit includes unrelated
response-cap contractions, repeated read amplification, and one stale proof.

## 3. Canonical authority reused

Current production already contains the required authority primitives and
indexes.

| Source kind | Current authority | Immediate inactive condition |
| --- | --- | --- |
| interaction root/reply | canonical interaction plus blocks, attachments, embeds, parent/root status, and visibility | missing, deleted/non-live, unreadable visibility, malformed/oversized child graph |
| Resource | canonical Resource/module/body resolution | missing or unreadable canonical body |
| AI Feed | canonical post resolution | missing, hidden, foreign, or otherwise unreadable post |
| generic/operational source trace | the trace row itself | missing, foreign, invalid, or `sourceVisibility=redacted` |
| legacy `chat` trace | no canonical evidence reference | always fail closed |

`resolveCommunityEvidenceRefCore` already returns `active`, `revoked`,
`not_readable`, or `invalid`. `checkCommunityEvidenceCitationCore` already
compares current source version, content hash, provenance hash, and captured
visibility and returns `active`, `superseded`, `revoked`, or `invalid`.

The production schema already has:

- node and change-request source-trace/citation/policy fields;
- digest item source traces and revisions;
- status/type/update indexes for bounded node reads;
- community and endpoint indexes for edges;
- community/time indexes for digests and change requests.

Therefore P27 requires no table, field, index, migration, backfill, queue,
scheduler, or new source-of-truth state.

## 4. Reader and consumer matrix

| Surface | Current production gap | Staging P27 outcome | Contract/caller consequence |
| --- | --- | --- | --- |
| direct canonical evidence read | already resolves current source truth | unchanged | already fail closed |
| authenticated Polynet memory graph | non-compiler derived nodes can survive source revocation | revoked nodes/edges omitted | same `community:getCommunityPolynetOverview` args and response shape; first-party live web graph sees fewer nodes |
| anonymous public memory graph | same non-compiler gap | revoked anonymous graph nodes/edges omitted | same `community:resolvePublicCommunityMemoryOverviewBySlug`; public funnel shape remains valid |
| native member-agent memory search/read | only compiler-tagged node evidence receives the full barrier | all evidenced nodes and neighbor edges re-resolve current evidence | tool names and internal validators unchanged; results contract safely contracts |
| official MCP memory search/read | shares the same internal memory functions | same fail-closed result as native | `polynet_workspace_memory_search/read`, HTTP dispatch, and MCP schemas are unchanged |
| manager directory and edges | manager bypass can expose revoked node/edge copies | revoked nodes/edges omitted for managers too | public Convex names/validators unchanged; no first-party UI caller found, but cached/external clients remain possible |
| manager compiler digests | copied title, summary, and source values remain readable | structural digest retained with neutral item/summary and `privacy_redacted_item_count` | additive field plus content redaction; public validator unchanged |
| manager change requests | requested payload and decision reason can retain copied content | structural request retained; payload becomes `{ privacy_redacted: true }` and decision reason is removed | response shape remains an object; public validator unchanged |
| community-agent filesystem list/read/search | node, edge, digest, request, and search copies remain readable | lists/search omit revoked material; direct reads fail or return a redacted request shell | internal tool names and validators unchanged |
| compiler digest claim/handoff | revoked digest may still be claimed and served | claim classifies it as handled/superseded before agent use | existing digest state/enum only; no new schema |

The authenticated/public Polynet graph, native tool runtime, official MCP
dispatcher and schemas, community-agent runtime callers, and relevant web
gateway/component types are otherwise identical between production and
staging. No UI code is part of P27.

## 5. API and cached-client compatibility

The P27 commit changes no Convex `args` validator, public/internal export name,
HTTP route, MCP tool name, tool schema, or web gateway payload.

Safe contractions:

- list/search results omit unreadable nodes, edges, and digests;
- exact internal reads return explicit unreadable-evidence errors;
- existing structured memory tools return no node or their existing
  `ok=false` error shape;
- public/authenticated graphs remain well-formed with lower counts;
- manager audit objects retain structural identity while content is redacted;
- community-agent/compiler consumers stop before copied content is served.

Two behavior changes are not part of the irreducible P27 requirement:

1. `listCommunityCompilerDigests` lowers its maximum from 50 to 20.
2. directory and edge listing lower their maximum from 500 to 100.

Those cap changes alter current and cached-client result cardinality. They must
be removed from the P27 port and handled, if still useful, as a separately
measured scalability contract.

## 6. Elon reduction

| Candidate requirement | Idiot index | PC3B decision |
| --- | ---: | --- |
| current canonical truth must gate every copied read | 0 | keep; security invariant |
| reuse the current canonical resolver/citation authority | 0 | keep |
| one shared derived-read predicate | 1 | keep, but rework its execution budget |
| preserve a structural manager audit shell while redacting content | 3 | keep provisionally; it preserves identity without returning copied text |
| lower unrelated public result caps in the security patch | 8 | delete from P27 |
| add a revocation table, queue, scheduler, or generic lifecycle engine | 10 | delete from the design |
| reproduce canonical-resolution logic independently in every reader | 8 | delete; one request-scoped owner |
| port all 1,125 changed lines as one unit | 9 | reject |

The minimum retained runtime job is one current-evidence predicate projected
through every content-bearing reader. Documentation, proof registration, and
one focused behavioral fixture accompany it; no adjacent C2 executor does.

## 7. Computational-complexity finding

The staged implementation is individually bounded but not acceptably bounded
as a whole.

- One node permits up to 50 source traces plus 50 citations.
- Citation checking re-resolves canonical evidence already resolved through
  the source-trace loop.
- The authenticated/public overview can inspect five status buckets with up to
  120 rows each: 600 candidate nodes.
- In the theoretical admitted shape, that is up to 60,000 lineage entries
  before the nested canonical interaction/resource/feed reads and hashing.
- A manager digest list can inspect 20 digests with up to 96 items each:
  1,920 canonical item resolutions.
- An agent-filesystem edge list can inspect up to 400 candidate edges, then
  re-read endpoint nodes and their lineages repeatedly.
- No request-scoped memoization or aggregate unique-reference budget prevents
  repeated resolution of the same trace, citation, node, or canonical source.

This is `O(candidate rows × lineage references × canonical-source cost)`.
Per-row caps and smaller response caps do not make that scalable.

Any future candidate must:

1. deduplicate source trace, citation, node, and canonical-ref resolution within
   one request;
2. impose one aggregate unique-reference/read budget per response;
3. fail closed before returning partially verified content;
4. preserve current public result caps unless a separate compatibility decision
   changes them;
5. prove the public graph, MCP/native memory, manager, community-agent, and
   compiler paths stay within the same explicit budget.

The exact aggregate budget needs a bounded PC4 distribution check before
release design is final. No data migration is required.

## 8. Proof assessment and drift

Current staging proof results during PC3B:

| Proof | Result |
| --- | --- |
| `test:community-evidence-revocation` | pass, 1/1 |
| intelligence-directory contract | pass |
| compiler-digest contract | pass |
| community-agent filesystem contract | pass |
| community-agent heartbeat contract | pass |
| memory retrieval-receipt contract | pass |
| evidence-integrity contract | pass after an environment-only sandbox IPC retry |
| interaction evidence spine | pass |
| Resource evidence spine | pass |
| AI Feed evidence spine | pass |
| memory-consumption parity contract | **fail** |

The parity proof still requires the deleted helper name
`compilerMemoryEvidenceIsCurrentlyReadable`. P27 renamed and widened that
helper to `communityMemoryEvidenceIsCurrentlyReadable` but did not update the
proof. The foundation baseline runs the new behavioral fixture but does not run
this parity proof, so its green result cannot detect the drift.

This is real technical debt, not a product failure. A future P27 candidate must
either:

- update the parity assertion and retain it until stronger behavioral coverage
  replaces its distinct native/MCP wiring job; or
- delete the lexical assertion only after the behavioral fixture directly
  proves native and MCP direct read as well as search.

The current single behavioral fixture proves one deleted reply across
directory, edges, memory search, manager digest/request, agent filesystem, and
heartbeat. It does not yet prove:

- authenticated or anonymous Polynet overview output;
- direct native/MCP `community_memory_read`;
- Resource, AI Feed, generic/operational trace, or legacy-chat containment;
- missing, wrong-community, malformed, duplicate, excessive, or multi-source
  lineage;
- manager/member/community-agent differences across every source kind;
- current-source edit/revision drift distinct from lifecycle revocation;
- aggregate read-budget behavior.

Those are acceptance requirements, not reasons to weaken fail-closed behavior.

## 9. Revision and privacy boundary

P27 must not overclaim.

- Citation-backed nodes and digest items detect content/provenance revision
  drift through immutable citation fingerprints or source revisions.
- A non-compiler node with active source traces but no citation policy is
  accepted when its sources remain active. The staging helper cannot prove its
  copied body matches the latest edited source.
- Generic/operational traces treat the trace row as canonical; revocation
  therefore requires that trace to become redacted.
- Legacy chat traces are intentionally unreadable because they cannot prove a
  canonical lifecycle.

Therefore PC3B confirms immediate lifecycle/visibility revocation containment.
It does not claim universal edit propagation or physical privacy purge. Those
remain separate C2.3B2/P26 concerns.

## 10. Rollback

P27 writes no new schema shape. Its only new state transition marks a revoked
compiler digest handled/superseded through fields and values already understood
by production.

Code rollback is nevertheless unsafe: the copied node, digest, request, and
trace content remains physically present, so restoring the old readers can
immediately expose it again. Once deployed, P27 must be a security floor:

- roll forward to the last known fail-closed reader;
- never approve rollback to the pre-barrier read behavior;
- preserve redacted/superseded structural rows;
- keep physical scrub as a later independently receipted lifecycle.

## 11. Minimal future candidate

P27 remains a backend-only release candidate rebuilt from then-current
`origin/main`.

Runtime scope:

1. one request-scoped current-evidence resolver based on existing production
   authority;
2. `communityIntelligenceDirectory.ts` read/overview/edge/request projections;
3. `communityCompilerDigest.ts` manager redaction without the 50-to-20 cap
   contraction;
4. `communityAgentFilesystem.ts` list/read/search containment;
5. `communityAgentHeartbeat.ts` pre-handoff supersession;
6. one expanded behavioral fixture plus repaired or intentionally superseded
   parity proof.

Explicit exclusions:

- no schema, data migration, table, index, queue, scheduler, UI, gateway, MCP
  schema, source-sync mutation, purge executor, account freeze, provider effect,
  or unrelated response-limit change;
- no merge or cherry-pick of the long-lived staging branch;
- no production integration or deployment before PC6 and human authorization.

## 12. PC3B verdict and next slice

| Concern | Result |
| --- | --- |
| P27 requirement | `PORT BACKEND-FIRST`; irreducible security outcome |
| production source/API/schema basis | compatible |
| cached clients | compatible safe contraction if existing caps and shapes are preserved |
| staging implementation | `REWORK`; do not port wholesale |
| production-data migration | none |
| later PC4 evidence | bounded reference/cardinality distributions for performance budget |
| rollback | security rollback forbidden; roll forward only |

PC3B is complete as a compatibility map. It does not authorize the future P27
candidate.

`PC3C` is the next bounded read-only slice: map P05 authenticated
identity/session source, schema, cookie/JWT/bridge contracts, cached-session
continuity, expiry/revocation behavior, and rollback against current
production. Auth/session is next because it is MVP core, security-sensitive,
and classified `EXPAND-MIGRATE-CONTRACT`; it must be understood before PC4
examines production session shape.

## 13. Subsequent checkpoint

PC3C is complete in
`pc3c-auth-session-compatibility-20260724.md`. P05 remains core, but its staged
migration must be reworked into `EXPAND-MIGRATE-OBSERVE-CONTRACT` to preserve
cached ancestor-cookie continuity before legacy session state contracts. PC3D
is next for P06 membership/community-access compatibility. This later
checkpoint does not alter the PC3B evidence or verdict above.
