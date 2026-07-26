# C6 — Read-Only Semantic Community Repository Map and Receipt

Status: historical planning map plus current implementation receipt; section 18 owns current C6 truth

Mapped: 2026-07-25
Reconciled: 2026-07-26

Repository lane at mapping time:

- worktree: `/Users/neilmcdevitt/code/arx/.worktrees/semantic-platform-staging-20260719`
- branch: `codex/semantic-platform-staging-20260719`
- source commit: `22b374f4625fb451915be30ab50bd403bbf28bc1`
- upstream commit: `22b374f4625fb451915be30ab50bd403bbf28bc1`
- production comparison: intentionally out of scope

Sections 1-17 preserve the read-only plan and evidence as they were understood
at `22b374f4`. Present-tense implementation statements inside those sections
are historical to that source boundary and must not be read as current truth.
Section 18 reconciles the implemented staging chain through `12b23889`, the
locally proved convergence commit `90badc0b`, the authenticated acceptance
receipt, and the remaining deployment boundary.

## 1. Answer first

C6 is not a filesystem and is not a new content system.

Its irreducible job is:

> Given one verified actor and one currently authorized community context,
> list a tiny deterministic namespace and read a bounded Markdown projection
> without creating new truth or escaping the context.

The accepted complete namespace is:

```text
/
|- community.md
|- self.md
`- resources/
   `- <category>/<resource>.md
```

The accepted model-facing surface is only:

```text
polynet_list
polynet_read
```

At the `22b374f4` mapping baseline, the staging source did **not** implement that
generic namespace or either generic tool. It did already contain the canonical
identity, access, community, profile, resource-content,
stable-resource-reference, native runtime, and MCP seams required to build it.

The correct architecture is one small projection router over those existing
owners. It needs no new table, materialized Markdown tree, cache, search index,
mount registry, workflow, scheduler, repository UI, or generalized resource
protocol.

The two material gaps that must be closed before C6 can honestly score 8/10
are:

1. `self.md` needs an explicitly bounded privacy projection. The existing
   ontology `self` lens is intentionally too broad because it includes the
   member's complete private ledger.
2. `resources/` needs honest bounded traversal. The current agent resource
   directory scans at most 500 modules and 5,000 resources, then slices the
   response without exposing scan truncation or a continuation cursor.

Everything else is adapter and proof work.

## 2. Normative boundary

The active architecture thesis and reduction contract establish these rules:

- Markdown is a deterministic projection, never canonical storage.
- Only `community.md`, `self.md`, and `resources/` are accepted initial mounts.
- Only bounded `polynet_list` and `polynet_read` are accepted now.
- Search, writes, calls, additional mounts, and generalized extension
  primitives are proposed or deferred.
- One explicit community context is the repository boundary.
- Current identity, membership, entitlement, and target visibility are
  revalidated on every call.
- A readable path is mutable location; a typed reference or semantic URI is
  stable identity.
- Native and official MCP surfaces reuse the same authority and read owners.
- Community/member content is contextual data with no instruction authority.
- The virtual repository can never expose shell, local filesystem, symlink, or
  path-escape behavior.
- Protected community resources, memory, compiler, MCP, and harness substrate
  cannot be deleted as part of this slice.

These are requirements. A larger virtual platform is not.

## 3. Constituent parts

C6 reduces to six parts:

1. **Verified actor**
   - the server fixes the human account;
   - a client-supplied user ID never selects the actor.
2. **Authorized community context**
   - exactly one community;
   - current membership, block, entitlement, and role truth;
   - closed access fails before namespace resolution.
3. **Strict selector**
   - a small absolute path or stable typed reference;
   - no traversal, context switching, or raw cross-community ID selection.
4. **Mount adapter**
   - one hard-coded adapter for community;
   - one hard-coded adapter for self;
   - one adapter over canonical live resources.
5. **Bounded deterministic projection**
   - metadata list or Markdown read;
   - stable ordering, finite output, explicit truncation and continuation.
6. **Thin surface adapter**
   - native member-agent runtime;
   - official Polynet MCP;
   - neither surface owns product authority.

No seventh part is physically required.

## 4. Current ground-truth architecture

### 4.1 End-to-end topology

```text
CURRENT NATIVE PATH

model
  -> native registry / runtime policy / prompt projection
  -> runtimeAgentLoop dispatch
  -> community read kernel or resource query/action
  -> verified actor + current community access
  -> canonical Convex records
  -> JSON tool output

CURRENT OFFICIAL MCP PATH

external harness
  -> shared/polynetMcp.ts wire schema
  -> httpMcp dispatch
  -> community slug or workspace-context compatibility resolver
  -> current authority/toolset check
  -> same community/resource internal readers
  -> structured MCP tool output

DESIRED C6 PATH

native polynet_list/read ----\
                              -> one semantic list/read owner
MCP polynet_list/read -------/     -> existing authority/read kernels
                                      -> deterministic Markdown or directory
                                      -> bounded envelope
```

At the mapping baseline there was no `semanticResourceKernel`, `polynet_list`,
`polynet_read`, `community.md`, or `self.md` implementation on that source
commit.

### 4.2 Canonical authority matrix

| Concern | Canonical owner now | C6 use | Status |
| --- | --- | --- | --- |
| verified account | `users` selected through the authenticated actor resolver | bind `self.md` to the caller | ready |
| community identity | `communities` | render `community.md`; bind namespace | ready; slug uniqueness is application-enforced |
| community ownership | `communities.ownerId` | derive owner authority | ready |
| non-owner relationship | unique `(communityId,userId)` membership plus block and subscription state | decide repository entry and current relation | ready |
| effective access | community access/capability resolver | fail closed before list/read | ready |
| display profile | `users` plus `userProfileDetails` | bounded identity section of `self.md` | source ready; duplicate-row guard required |
| structured member facts | `memberFacts` ledger | not read directly by C6 without a bounded lens | policy ready; scale adaptation required |
| compact profile facts | `memberProfileSpines`, derived from approved platform facts | bounded `self.md` orientation | source ready; duplicate-row guard required |
| resource identity/metadata | `communityResources` | resource entry identity and metadata | ready |
| resource categories | `communityResourceModules` | `resources/` directories | ready |
| resource Markdown/hash | `communityResourceContents` | canonical resource body | ready |
| resource stable ref | `resource:<id>` evidence ref | stable read selector | ready |
| resource readable path | resource directory projection | human/model navigation | ready, mount prefix adaptation required |
| resource retrieval receipt | community evidence audit | preserve read evidence | ready |
| native tool execution | shared registry plus server runtime dispatch | thin C6 adapter | ready, declaration fan-out remains |
| official MCP execution | MCP schema plus server HTTP dispatch | thin C6 adapter | ready, compatibility vocabulary remains |
| browser resources UI | direct bounded directory and exact resource read | remains a separate human projection | not a C6 dependency |

### 4.3 Documentation drift

`docs/system-map/02-canonical-authority-graph.md` still describes resource body
storage as a dual-read migration. Current code and
`docs/system-map/domains/resources-intelligence.md` establish newer truth:

- `communityResources` owns identity, metadata, and derived `bodyChars`;
- `communityResourceContents` is the sole durable Markdown/hash owner;
- duplicate, missing, scope-mismatched, malformed, or projection-mismatched
  content fails closed;
- legacy inline body authority and temporary migration surfaces are gone.

C6 must use the current resource dossier and current code as truth. It must not
reintroduce inline or fallback body reads because an older map is stale.

## 5. Mount-by-mount map

### 5.1 `/community.md`

#### Job

Orient an authorized agent to the institution it is currently inside.

#### Canonical source

The existing `resolveAccessibleCommunityReadDetail` path already:

1. resolves verified actor plus community slug;
2. loads the indexed community;
3. resolves the unique membership pair and current access;
4. fails closed on invalid, unavailable, mismatched, or closed context;
5. projects bounded identity, visibility, entry policy, relation, entitlement,
   and capabilities.

#### Body

The Markdown body should contain only community-owned semantic content:

- name;
- one-line description;
- about;
- Published or Unlisted visibility;
- open, approval, or paid-subscription entry policy;
- canonical community URL.

Per-viewer relation, entitlement, and capabilities belong in the response
envelope or `self.md`, not duplicated as community-authored prose.

All community-authored text is contextual data. Render it so it cannot be
confused with trusted system instructions.

#### Stable identity and revision

- current path: `/community.md`;
- stable identity: a community-profile semantic ref/URI bound to the canonical
  community ID;
- source revision: canonical `communities.updatedAt`;
- media type: `text/markdown; charset=utf-8`;
- instruction authority: `none`.

The isolated candidate URI
`polynet://polynet.ai/communities/<community-id>/profile` is reasonable input
to adapt. It must not be accepted when its ID differs from the active
community.

#### Current gap

The structured read exists, but deterministic Markdown and the C6 envelope do
not. The current capability projection also does not carry the community
revision, so the C6 source must read or project `updatedAt` explicitly.

The `by_slug` index is not database-unique and the current resolver takes the
first row. C6 should not widen that assumption: the shared context resolver
must take at most two exact slug rows and fail closed if corruption produces a
duplicate.

### 5.2 `/self.md`

#### Job

Orient the actor's own agent to the actor it serves inside the current
community without leaking unrelated account, community, billing, credential,
or private-ledger state.

The profile remains user-owned. The active community controls whether the
repository can be entered, not ownership of the profile.

#### Canonical source

Use a bounded composition of:

- verified `users` row for handle and account identity;
- unique `userProfileDetails` row for display name, bio, timezone, and public
  social links;
- unique `memberProfileSpines` row for compact approved platform orientation;
- current resolved community relation/capabilities for this community only.

The spine is a derived projection. The `memberFacts` ledger remains truth.

#### Critical privacy decision

Do **not** use `readMemberFactsForLens(..., { kind: "self" })` for the C6
document. That lens intentionally returns the member's complete ledger,
including pending, rejected, retracted, superseded, and `agent_internal`
history. The member may inspect that through an explicit private account
surface, but a generic repository read should not silently inject it into
every native or external model context.

The current external-profile policy is the safer semantic precedent:

- platform-scoped only;
- approved only;
- no observed behavior;
- no community facts;
- no audit-history states.

For irreducible boundedness, C6 should initially use the existing compact spine
instead of collecting and sorting the entire member fact ledger.

#### Include

- display name;
- handle;
- bio;
- timezone;
- public social links;
- compact situation, goals, interests, and links from the approved platform
  spine;
- relation to the active community;
- a concise current capability summary only if it materially improves agent
  behavior.

#### Exclude

- email and email-verification metadata;
- `authSubject`, database IDs in body, session state, and credentials;
- platform tier, billing, Stripe, and inference-provider connections;
- all other memberships and owned communities;
- personal memory;
- community-scoped facts;
- evidence refs, confidence, provenance, and internal audit fields;
- pending, rejected, retracted, superseded, or agent-internal facts.

#### Stable identity and revision

- current path: `/self.md`;
- stable identity: a user-profile semantic ref/URI bound to the verified actor;
- source revision: deterministic composite of the exact user, profile, spine,
  and current-context revisions used;
- media type: `text/markdown; charset=utf-8`;
- instruction authority: `none`.

The isolated candidate URI
`polynet://polynet.ai/users/<user-id>/profile` and its narrow profile renderer
are useful inputs. The candidate's full kernel must not be merged blindly.

#### Current gap

The current MCP profile read collects all platform facts before slicing to
100, and the richer self query collects the user's entire ledger. Both are
bounded in response but not bounded in database work. The spine gives C6 a
smaller existing projection and avoids a new index or full-ledger scan.

`userProfileDetails.by_user` and `memberProfileSpines.by_user` are also not
database-unique. Current helpers call `.first()`. The C6 projection must use
two-row duplicate detectors and fail closed rather than silently selecting one
conflicting profile.

### 5.3 `/resources/`

#### Job

Navigate and read the active community's live member-visible knowledge pages.

#### Canonical source

The existing resource owner already provides:

- current chat/member access enforcement;
- live-module filtering;
- member-visible page filtering;
- stable `resource:<id>` refs;
- readable category/resource paths;
- resource-specific stable directory URIs;
- ambiguity detection for colliding readable paths;
- canonical body hydration from `communityResourceContents`;
- bounded offset/character reads;
- retrieval receipts for native and MCP evidence reads.

Draft modules, source inboxes, builder health, changesets, and unpublished
builder state are not part of the C6 member repository.

#### Path adaptation

The resource subsystem currently treats `/` as its own root and returns paths
such as:

```text
/category/resource
```

C6 must treat it as a mounted namespace:

```text
/resources/category/resource.md
```

The adapter strips the `/resources` prefix before calling the resource owner
and restores it on returned readable paths. Existing stable `resource:<id>`
refs and `resources://community/...` directory URIs remain valid identities;
the adapter must not mint a second resource ID.

Readable paths may collide after title/category normalization. On collision,
list returns stable refs and read by ambiguous path fails with bounded matches.

#### Read semantics

- accept only a returned absolute resource path, `resource:<id>`, or validated
  resource directory URI;
- reauthorize current actor and community;
- require the resource to remain a member-visible page in a live module;
- resolve a stable `resource:<id>` through the existing exact
  `resolveCommunityResourceEvidenceSource` path instead of scanning the
  directory;
- hydrate only the selected canonical body;
- preserve offset, limit, total characters, and truncation;
- preserve the existing evidence retrieval receipt;
- never expose raw file keys, uploaded binary contents, source inboxes, or
  builder metadata.

#### Current scale gap

Current agent resource list/read helpers:

- scan at most 500 modules;
- scan at most 5,000 resources;
- return at most 100 list entries;
- read at most 20,000 characters, default 12,000;
- batch at most 10 refs and 50,000 total characters.

The body-character bound is sound. The current single-resource directory read
still scans the capped resource directory before selecting the target, so its
database work is not exact. The existing evidence-source resolver already
loads a typed resource ID and its module directly and should become the stable
ref path.

The list bound is not complete traversal because scan truncation is not
reported and there is no cursor. C6 must use indexed, cursorable traversal or
return explicit scan truncation. Silent omission is not acceptable.

The existing browser directory's 201-row probe and explicit 200-row
`truncated` flag are a useful reliability precedent, but the C6 repository
needs continuation if an agent is expected to navigate every live page.

## 6. One semantic contract

The internal C6 contract should own semantic meaning, not transport details.

### 6.1 Logical list input

```text
verified actor
resolved community context
absolute path
optional opaque cursor
bounded limit
surface
```

### 6.2 Logical list output

```text
ok
community identity
canonical directory path
entries[]
next_cursor | null
truncated
```

Each entry contains only:

```text
kind          file | directory
name
path          current readable location
ref           stable typed identity
media_type    for files
summary       optional, bounded
updated_at    optional, canonical
```

Root listing is always at most three entries and never paginates.

### 6.3 Logical read input

```text
verified actor
resolved community context
absolute path or stable typed ref
bounded offset
bounded character limit
surface
```

### 6.4 Logical read output

```text
ok
community identity
document:
  kind
  path
  ref
  media_type
  source_revision
  instruction_authority = none
content:
  text
  offset
  limit
  total_chars
  truncated
optional existing retrieval receipt
```

Do not require identical native and MCP wire shapes. Require semantic parity:
same actor, same community, same mount, same authorization, same canonical
body, same bounds, and equivalent failure.

### 6.5 Transport context

- Native runtime: the server-selected active thread community supplies the
  context. The model does not pass a community selector.
- Official MCP: require an explicit `community_slug` and revalidate it on
  every call. Do not make the new semantic surface inherit the legacy
  `workspace_context_id` vocabulary merely because compatibility tools still
  use it.

## 7. Strict namespace and selector rules

The first resolver is a hard-coded switch, not a registry:

```text
/
/community.md
/self.md
/resources
/resources/
/resources/<validated resource path>
```

Rules:

1. maximum selector length is 1,024 characters;
2. paths are absolute;
3. root is exactly `/`;
4. reject NUL, control characters, backslash, `.`, and `..` segments;
5. reject duplicate slash and non-canonical trailing slash instead of silently
   rewriting dangerous input;
6. do not URL-decode a JSON path and do not double-decode `%` sequences;
7. a fixed community/user semantic URI must match the active context/actor;
8. a resource ref must resolve inside the active community and current
   visibility policy;
9. raw database IDs are not generic C6 selectors;
10. unknown mounts return one uniform not-found/not-accessible response.

Because the repository is virtual, there are no symlinks. No future adapter may
turn a repository path into a local filesystem path.

The current resource helper collapses repeated slashes and does not reject
traversal-like segments. That behavior is acceptable only inside its
resource-specific matching domain; the new outer C6 resolver must reject
non-canonical selectors before delegation.

## 8. Security invariants

### Identity and context

- Actor identity is fixed server-side.
- `self.md` can only resolve to that actor.
- Exactly one current community is selected.
- Native thread context or explicit MCP community slug is an assertion until
  server validation succeeds.
- Community ID, slug, membership, access, and target row must agree.
- Duplicate community slug, user profile, profile spine, membership, or
  resource-content rows fail closed; C6 never selects an arbitrary first row.
- Every list and read reauthorizes current state; a prior successful list
  grants nothing.
- Revocation between list and read causes read failure.

### Visibility

- Root listing reveals only real implemented mounts.
- Directory listing never reveals an unreadable object.
- Member resources expose only usable pages in live modules.
- Drafts, source inboxes, builder state, internal facts, and credentials are
  absent, not merely redacted after retrieval.
- Cross-community refs fail uniformly without confirming that the target
  exists.

### Prompt injection

- Community profile, self profile, and resource Markdown are contextual data.
- Each envelope states `instruction_authority: none`.
- Renderers preserve authored text but visually/structurally distinguish it
  from trusted runtime instructions.
- A document cannot grant tools, membership, entitlement, consent, or
  authority.

### Bounds and abuse

- List limit has a small server maximum and opaque continuation cursor.
- Read limit is at most 20,000 characters per call.
- Offset is finite, non-negative, and bounded.
- Root/profile documents are rendered from bounded fields/projections.
- Resource listing does not hydrate bodies.
- Resource read hydrates one exact body.
- Error responses do not return stacks, credentials, raw storage keys, or
  private row shapes.

## 9. Reliability and failure semantics

| Failure | Required result |
| --- | --- |
| unauthenticated actor | fail closed |
| invalid or inaccessible community | uniform not-accessible |
| revoked membership/entitlement | fail closed on current call |
| invalid/non-canonical path | deterministic invalid-selector error |
| unknown mount/path | deterministic not-found without metadata oracle |
| cross-community stable ref | uniform not-accessible |
| duplicate profile/content row | fail closed; do not choose one |
| ambiguous readable resource path | return bounded stable matches; require ref |
| missing/malformed resource content | explicit unavailable/fail-closed result |
| offset past end | empty text with truthful total/truncation semantics |
| list page exhausted | `next_cursor: null`, `truncated: false` |
| underlying scan/page incomplete | explicit continuation or truncation; never silent |
| context changes after call | affects subsequent calls only |
| resource-read receipt write fails | read should not claim fully successful audited retrieval |

Deterministic profile rendering must golden-test exact output. Ordering cannot
depend on database collection accident, locale drift, or wall-clock time.

## 10. Complexity and scalability

Let:

- `C` = communities;
- `M_u` = memberships for one user;
- `F_u` = member facts for one user;
- `D_c` = resource categories in one community;
- `R_d` = resources in one category;
- `B` = requested body characters.

| Operation | Desired cost | Ground truth / action |
| --- | --- | --- |
| list `/` | `O(1)` | hard-coded at three entries |
| read `community.md` | indexed actor/community/access reads plus `O(body)` | current read kernel is reusable |
| read `self.md` | constant indexed row reads plus bounded spine projection | use `memberProfileSpines`; do not scan `F_u` |
| list `/resources/` | `O(page_size log D_c)` | add/use cursorable indexed category traversal |
| list one category | `O(page_size log R_d)` | use module index plus opaque cursor and visibility filtering |
| read one resource | indexed exact reads plus `O(B)` | use exact evidence-source resolution plus canonical content hydration; do not reuse the directory scan |

Do not optimize by materializing Markdown. If later latency evidence justifies
a cache, it is disposable derived data keyed by canonical revision and is
never required for correctness.

## 11. Surface overlap and reduction ledger

Nothing below is an immediate deletion authorization.

| Surface/candidate | Current job | C6 decision | Idiot index | Retirement condition |
| --- | --- | --- | ---: | --- |
| community/access/read kernels | canonical authorization and bounded community projection | `KEEP (MVP core)` | 0 | never replaced by C6 |
| profile/ontology/spine owners | canonical user-owned profile truth and projection | `KEEP (MVP core)` | 0 | never replaced by C6 |
| resource/content/evidence owners | canonical community knowledge and audited reads | `KEEP (MVP core)` | 0 | protected core |
| `polynet_list_communities` | discover/select community context | `KEEP` | 1 | not duplicate of in-community listing |
| `polynet_get_community` | structured community lookup before/without repository context | `KEEP`, later observe overlap | 4 | retire only after all consumers use `community.md` and selection still works |
| `polynet_get_my_profile` | platform-global authenticated profile read | `KEEP`, later observe overlap | 5 | retire read only after external `self.md` proves equivalent need; keep profile confirmation mutation separate |
| native `community_resources_list` | member resource navigation | `COMPATIBILITY`, migrate | 7 | generic list has parity, consumers migrate, observation finds no use |
| native `community_resource_read` | one audited resource read | `COMPATIBILITY`, migrate | 7 | generic read preserves visibility, bounds, and receipt |
| native `community_resources_read` | bounded batch read | `DECISION REQUIRED` | 5 | retain only if measured call/token efficiency justifies a separate batch primitive |
| native `community_resources_map` | eager structural summary | `DELETE candidate` | 8 | cursorable list proves sufficient and consumers migrate |
| MCP `polynet_workspace_resources_*` | external compatibility tools | `VERSION, MIGRATE_THEN_DELETE` | 7 | explicit external compatibility decision and observation window |
| resource search tools | targeted lookup | `KEEP OUTSIDE C6` | 2 | search is a later semantic operation, not list/read duplication yet |
| runtime prompt/policy/timeline entries for old resource tools | presentation/availability adapters | `MIGRATE_THEN_DELETE` | 6 | old tool support is retired |
| isolated semantic profile renderers | candidate pure projection logic | `ADAPT` | 3 | copy only logic proven against current owners |
| isolated semantic kernel | separate community/profile resolver | `ADAPT SMALL PARTS` | 7 | do not merge redundant authority or surface code |
| isolated MCP resource descriptors/protocol | MCP `resources/list/read` expansion | `DISCARD/DEFER` | 9 | not required by accepted two-tool C6 |
| isolated community runtime manifest/lane registry | orientation over many old tools/search lanes | `DISCARD/DEFER` | 9 | duplicates prompt/tool discovery and widens C6 |
| per-read content SHA-256 | cache/change hint | `OMIT NOW` | 7 | canonical revisions already support first implementation |
| generalized mount registry | abstraction before real mount diversity | `DO NOT BUILD` | 9 | hard-coded three-mount switch is sufficient |
| semantic Markdown/path database | second authority and synchronization burden | `DO NOT BUILD` | 10 | prohibited by thesis |
| repository browser UI | new human product surface | `DO NOT BUILD` | 9 | native agent output and existing Resources UI already cover MVP |
| shell/filesystem bridge | trust-boundary escape | `DO NOT BUILD` | 10 | permanently prohibited |
| search/write/call/additional mounts | future expansion | `DEFER` | 8 | separate evidence and authorization required |

## 12. Isolated candidate commit classification

The current branch deliberately excludes:

- `3d5286a6` — community profile semantic resource;
- `618c249f` — self profile semantic resource;
- `9783f548` — simplified semantic profile Markdown;
- `bb45ee9c` — community runtime orientation manifest;
- `424f9d4b` — hardened runtime orientation.

They are not staging truth.

### Reuse or adapt

- pure deterministic community/profile Markdown renderers;
- stable identity separate from readable path;
- bounded source revision;
- `semantic_role: context`;
- `instruction_authority: none`;
- external-profile visibility for user facts;
- renderer escaping/blockquote treatment for authored content;
- exact actor/community URI match checks.

### Discard or defer

- generalized semantic-resource machinery beyond three concrete mounts;
- independent authority resolution that duplicates current kernels;
- MCP resource descriptors and MCP resource-list/read protocol;
- community runtime lane registry;
- search and old tool-family orientation in the C6 manifest;
- per-read cryptographic content hash as a launch requirement;
- broad multi-file surface fan-out before one vertical tool slice works.

The five commits add thousands of lines across kernels, manifests, MCP,
runtime, prompts, proofs, and docs. Their conceptual lessons are useful; their
branch shape is not the irreducible implementation.

## 13. Required implementation sequence

### C6.1 — One real vertical slice: root plus `community.md`

Implement:

- one small shared list/read semantic contract;
- strict outer path/ref parser;
- one internal owner that reuses the current community context/read kernel;
- `polynet_list("/")`, returning only mounts that are actually readable in
  this slice;
- `polynet_read("/community.md")`;
- native adapter using server-selected active community;
- official MCP adapter requiring explicit community slug;
- deterministic Markdown renderer and bounded envelope;
- exact native/MCP parity, authorization, path, revocation, and golden-output
  proofs.

Do not list `self.md` or `resources/` as placeholders until their readers are
real.

Why first: it proves the complete architecture with the smallest canonical
source and no new data model.

### C6.2 — Add bounded `self.md`

Implement:

- exact verified-self binding;
- bounded user/profile/spine composition;
- current-community relation projection;
- explicit exclusion tests for private ledger states, other communities,
  billing, providers, credentials, and personal memory;
- native/MCP parity and deterministic revision/output proof.

No direct full-ledger scan.

### C6.3 — Mount canonical resources

Implement:

- strict `/resources` path adapter;
- cursorable directory traversal with explicit continuation;
- stable `resource:<id>` read;
- canonical exact body hydration;
- preserved retrieval receipt;
- collision, rename, deletion, revocation, truncation, and cross-community
  proofs.

Do not expose builder/source state.

### C6.4 — Convergence and surface reduction

After a bounded observation window:

1. identify every first-party and external consumer of old list/map/read tools;
2. migrate consumers that gain semantic parity;
3. delete the eager resource map if list traversal fully replaces it;
4. decide whether batch read earns its extra surface;
5. version and retire `workspace_*` MCP compatibility only with explicit
   external evidence;
6. remove old prompt/policy/timeline declarations only with their tools;
7. update stale resource-authority documentation.

No compatibility tool is deleted merely because C6 exists.

## 14. Proof contract

C6 is complete only when automated proofs demonstrate:

1. no schema or materialized Markdown store was added;
2. root lists exactly the three real mounts and no placeholders;
3. both tools reject unauthenticated requests;
4. both tools reject inaccessible, blocked, revoked, or mismatched community
   context;
5. native and MCP reads have semantic parity;
6. native context cannot be overridden by model input;
7. MCP community selection is explicit and revalidated;
8. `community.md` is deterministic and contains only bounded canonical fields;
9. `self.md` binds to the actor and excludes every named private/cross-context
   class;
10. duplicate community slug, profile-detail, profile-spine, membership, and
    resource-content state fails closed;
11. `resources/` lists only live member-visible pages;
12. every list page is bounded and has truthful continuation/truncation;
13. every read is bounded and reports total/truncated truth;
14. stable-ref resource read performs exact target/module/content reads rather
    than a full community directory scan;
15. path traversal, backslash, non-canonical paths, malformed refs, raw IDs,
    and cross-community refs fail closed;
16. readable-path collisions require a stable ref;
17. resource rename changes path but not stable ref;
18. resource deletion/revocation after listing makes the later read fail;
19. resource reads preserve the existing retrieval receipt;
20. authored Markdown has no instruction authority;
21. current Resources UI and protected resource/compiler/MCP/harness behavior
    remain unchanged;
22. no search, write, call, extra mount, repository UI, shell, or filesystem
    behavior was introduced.

Static source assertions alone are insufficient. The final C6 acceptance
requires focused contract tests plus authenticated native and official-MCP
journeys on the staging path.

## 15. Planning-baseline score

Scores describe the current source's readiness for C6, not the quality of the
whole platform.

| Dimension | Current | Evidence |
| --- | ---: | --- |
| canonical data ownership | 8.5/10 | community, profile, resource identity, and resource body owners are explicit |
| authorization substrate | 8/10 | current actor/community/resource paths fail closed and revalidate access |
| semantic repository implementation | 1/10 | accepted generic namespace and tools are absent |
| simplicity | 5/10 | correct owners exist, but native/MCP/resource tool declarations remain broad |
| scalability | 5/10 | exact reads are bounded; self fact and agent resource directory scans are not traversal-safe |
| reliability | 6/10 | strong resource integrity and ambiguity checks; no generic parity/path contract yet |
| robustness | 6/10 | existing reads have explicit failures; outer namespace and continuation are missing |
| security | 6.5/10 | strong authority seams; full self lens and permissive outer path behavior must not leak into C6 |

Planning-baseline C6 status: **not implemented, but well-positioned**.

The substrate is strong enough that C6 does not need architecture invention.
It needs a narrow projection, two boundedness corrections, and proof.

## 16. Planning-baseline final call

Proceed with C6, but do not implement it as the isolated candidate branch did.

The best first slice is C6.1: one root listing and one `community.md` read,
working end-to-end through both native and official MCP adapters from one
internal owner. That is the smallest slice that proves the architecture is
real rather than adding unused substrate.

Stop after that slice and review. Do not add `self.md`, resources, search,
writes, calls, manifests, registries, UI, caching, or compatibility deletions
until the first vertical path is demonstrably simple, bounded, authorized, and
transport-parity safe.

## 17. Primary evidence

Normative:

- `AGENTS.md`
- `docs/agent-native-semantic-platform-thesis.md`
- `docs/polynet-reduction-execution-contract-v1.md`

Canonical community/access:

- `convex/authActor.ts`
- `convex/communityCore.ts`
- `convex/communityCapabilityContext.ts`
- `convex/communityReadKernel.ts`
- `shared/communityCapabilityContextContract.ts`
- `shared/communityReadContract.ts`

Self/profile:

- `convex/memberOntology.ts`
- `convex/memberOntologyCore.ts`
- `shared/memberOntology.ts`
- `shared/memberContextMarkdown.ts`
- `convex/schema.ts` (`users`, `userProfileDetails`, `memberFacts`,
  `memberProfileSpines`)
- `docs/member-ontology-contract-v1.md`

Resources:

- `convex/communityResources.ts`
- `convex/communityResourceContent.ts`
- `convex/communityResourceEvidence.ts`
- `shared/communityResourceDirectory.ts`
- `shared/communityResourceVisibility.ts`
- `shared/communityEvidenceContract.ts`
- `docs/system-map/domains/resources-intelligence.md`

Surfaces:

- `shared/toolRegistry.ts`
- `shared/polynetPlatformToolSurface.ts`
- `shared/polynetMcp.ts`
- `shared/runtimeContextManifest.ts`
- `shared/runtimePrompt.ts`
- `shared/runtimeToolPolicy.ts`
- `shared/runtimeInvocationSurface.ts`
- `shared/runtimeTimelineUi.ts`
- `convex/runtimeAgentLoop.ts`
- `convex/httpMcp.ts`
- `docs/system-map/domains/agents-tools-apps-mcp.md`

Candidate-only evidence:

- commits `3d5286a6`, `618c249f`, `9783f548`, `bb45ee9c`, and `424f9d4b`

## 18. Current implementation and acceptance receipt — 2026-07-26

### 18.1 Current answer

C6 is implemented on the staging source path and locally proved through its
native-tool convergence candidate. It is not yet complete because the
convergence commit has not been deployed and post-deploy absence evidence has
not been collected.

The accepted current namespace is:

```text
/
|- community.md
|- self.md
|- members/
`- resources/
   `- <category>/<resource>.md
```

`/members/` was added by explicit user direction after the original
three-mount plan. It is a bounded member-profile projection over existing
authority, not a generic user or database browser. The model-facing semantic
surface remains exactly:

```text
polynet_list
polynet_read
```

Search, writes, calls, additional mounts, a mount registry, materialized
Markdown, repository UI, shell access, and local-filesystem behavior remain
outside C6.

### 18.2 Implementation lineage

The implementation did not merge the five isolated candidate commits described
in section 12. It landed as seven bounded slices:

| Commit | Result |
| --- | --- |
| `b12736e7` | canonical community semantic read |
| `a9a72cd0` | reduced semantic agent output |
| `71e96929` | bounded semantic self profile |
| `7f5cda1f` | agent-readable member profiles |
| `1479e17a` | exact stable resource reads |
| `e8837fde` | cursorable semantic resource traversal |
| `12b23889` | canonical resources mount |

Across those commits, 55 files changed with 4,003 insertions and 695 deletions.
The larger-than-desired addition is why C6.4 convergence was required before
any new semantic expansion.

Commit `90badc0b` is the isolated convergence candidate. It changes 24 files
with 97 insertions and 442 deletions. It retires these duplicate native tools:

- `community_resources_map`;
- `community_resources_list`;
- `community_resource_read`.

It retains:

- `community_resources_search`;
- `community_resources_read`;
- all resource-builder tools;
- all external `polynet_workspace_resources_*` MCP compatibility tools;
- canonical backend map/list/read owners still used by semantic and external
  adapters;
- historical timeline and context-receipt decoding;
- the `community_resource_read` evidence-capability literal.

The active source has no declarations, policies, schemas, capability
projections, or dispatch branches for the three retired native names.
Historical decoding, backend result kinds, and evidence vocabulary remain
intentionally readable.

### 18.3 Plan-to-result reconciliation

| Planning requirement | Current result |
| --- | --- |
| one shared list/read meaning | native and official MCP adapters reuse the semantic repository owners |
| verified actor and one authorized community | resolved server-side and revalidated per request |
| strict namespace | canonical paths only; traversal, backslashes, malformed refs, and context escape fail closed |
| deterministic `community.md` | implemented |
| bounded private `self.md` | implemented without the full private fact ledger |
| bounded other-member profiles | implemented under `/members/` after explicit user direction |
| cursorable `resources/` | implemented with stable ordering and continuation |
| exact stable resource read | implemented through `resource:<id>` with canonical content hydration |
| truthful content windows | `offset`, `limit`, `next_offset`, `total_chars`, and `truncated` are supported |
| retrieval evidence | semantic resource reads reuse the canonical audited evidence action |
| no second content authority | no new schema, Markdown store, cache, or materialized repository |
| surface convergence | three duplicate native tools deleted locally; external compatibility retained |

### 18.4 Authenticated staging acceptance

The positive resource journey was previously blocked because staging had two
legacy pages under `Needs sorting` but no live categorized readable page.
Publishing either existing page would have changed member visibility without
permission.

After explicit approval, the normal staging UI created:

- category: `C6 Acceptance - Temporary 20260726`;
- page: `C6 Semantic Read Proof`;
- body marker: `C6-20260726-READ-PARITY`.

The category was made live only for the bounded acceptance. Member preview
showed exactly that one page; the two legacy `Needs sorting` pages remained
excluded and unchanged.

Native member-agent proof:

- `polynet_list("/")` exposed only real mounts;
- `polynet_list("/resources/")` returned the temporary category;
- category listing returned a stable `resource:<id>` ref and readable path;
- exact read returned all 104 characters;
- the live declaration exposed a defect: normalization and dispatch supported
  resource windows, but the native schema omitted `offset` and `limit`.

Official MCP proof against
`https://polynet-staging.vercel.app/runtime/mcp`:

- OAuth authenticated the same staging account;
- tool discovery exposed `polynet_list` and `polynet_read` while preserving
  external compatibility tools;
- root, resource, and category listings matched native paths and refs;
- `limit: 80` returned 80 characters with `next_offset: 80`,
  `total_chars: 104`, and `truncated: true`;
- `offset: 80, limit: 80` returned the remaining 24 characters with
  `truncated: false`;
- the same stable ref under a different community selector returned
  `Semantic resource not available`;
- `../etc/passwd` returned the canonical traversal-free path error.

Staging evidence rows recorded the same community, actor, capability, and
resource ref across both surfaces:

- `n57r1f8zbe4tfpp1q2g7ppj2ns8b96wn` —
  `member_agent_dock`;
- `n57k6fycx1vmmsfmne47fdb5318b866d` —
  `external_mcp`;
- `n57h46h9yv51tj3ap56vzwf2w58b8m8n` —
  `external_mcp`.

Cleanup was part of acceptance:

1. moving the category to draft made the stable ref fail closed;
2. the page was deleted through the normal UI;
3. the empty category was deleted through the normal UI;
4. `/resources/` returned empty;
5. the stable ref remained unavailable;
6. the two preexisting `Needs sorting` pages were untouched.

Only immutable audit receipts remain. No disposable category, page, or
member-visible residue remains.

### 18.5 Local convergence proof

The schema defect found live is corrected in `90badc0b`: native
`polynet_read` now publishes the already-supported bounded `offset` and `limit`
arguments.

Focused semantic-repository, resource traversal, resource-tool, evidence-spine,
runtime prompt/policy/router, tool-role, member-agent, official-MCP,
official-MCP-auth, web-typecheck, staging identity, and staging source proofs
pass. The broad 40-step foundation baseline also passes. The final active-name
audit finds the three retired names only where historical decoding, backend
compatibility result kinds, or evidence vocabulary intentionally preserve
them.

### 18.6 Current score

Scores describe the local C6 source candidate, not the whole platform and not a
deployment state.

| Dimension | Current | Evidence |
| --- | ---: | --- |
| canonical data ownership | 8.5/10 | every mount projects existing canonical owners; no second store |
| authorization substrate | 8.5/10 | verified actor, one community, per-call access, and cross-context failures are proved |
| semantic repository implementation | 8.5/10 | four real mounts and two semantic tools are implemented |
| simplicity | 8/10 | three duplicate native tools are deleted; bounded batch/search and external compatibility have explicit jobs |
| scalability | 8/10 | member/resource traversal is cursorable and stable resource reads are exact |
| reliability | 8/10 | deterministic output, truthful continuation, deletion/revocation failure, and parity are proved |
| robustness | 8/10 | malformed, ambiguous, stale, deleted, and cross-community selectors fail closed |
| security | 8.5/10 | contextual content has no instruction authority and filesystem/context escape is rejected |

### 18.7 Remaining boundary

C6 status is `LOCALLY_PROVED`.

The next action is release evidence, not more architecture:

1. finish and commit this documentation reconciliation;
2. require a clean worktree and rerun staging release guards;
3. deploy Convex staging from the exact validated commit;
4. push `codex/semantic-platform-staging-20260719`;
5. let the `polynet-staging` Vercel project deploy from Git;
6. verify `/version.json` equals the pushed commit;
7. repeat authenticated native and official-MCP semantic list/read;
8. confirm the three retired native names do not appear in new runtime tool
   events.

Only then may C6 move from `LOCALLY_PROVED` to `LIVE_PROVED` and `COMPLETE`.
Production comparison, data queries, integration, and release remain out of
scope.
