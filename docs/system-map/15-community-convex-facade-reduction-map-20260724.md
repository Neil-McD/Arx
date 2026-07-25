# Community Convex Facade Reduction Map — 2026-07-24

- Status: intermediate facade, bounded legacy public identities, unused
  private plugin-import subsystem, and unused public agent-transport wrapper
  and admin-read deletions `COMPLETE` on the local staging worktree and
  development Convex
- Mapping source: `8fd1b8b9cbd90dffc0f259fdd2163791bdd1c9e6`
- Implementation base: `8fd1b8b9cbd90dffc0f259fdd2163791bdd1c9e6`
- Worktree:
  `/Users/neilmcdevitt/code/arx/.worktrees/semantic-platform-staging-20260719`
- Branch: `codex/semantic-platform-staging-20260719`
- Product, schema, data, provider, active UI, and production changes: none
- Development deployment: `dev:quick-porcupine-949`

## Irreducible job

Each public community operation should have one supported transport identity
that reaches one authority implementation. Compatibility adapters may exist
only for a named caller and retirement window. An intermediate module that
owns no validation, authorization, state, or behavior is not architecture; it
is callable surface area.

This map covers the Convex module/facade boundary only. It does not authorize
deletion of the protected community harness, community resources/memory,
community compiler, official MCP, or any source authority module.

## Current ground truth

| Surface | Current shape | First-party evidence | Disposition |
| --- | ---: | --- | --- |
| `convex/community.ts` | 136 registered aliases | 117 aliases referenced by first-party runtime code; two obsolete admin-read aliases deleted in the latest unit | `KEEP` as the current web/cached-client facade; reduce per alias later |
| `convex/communityExperience.ts` | deleted | zero `api.communityExperience.*` or `communityExperience:*` runtime calls | `DELETE COMPLETE` |
| `communityAccessQueries` | 2 former intermediate aliases | imported directly by `community.ts` | source owner kept |
| `communityPublic` | 8 retained former intermediate aliases | imported directly by `community.ts`; source has an internal runtime consumer | source owner kept |
| `communityResources` | 45 former intermediate aliases | imported directly by `community.ts`; source is used by runtime and official MCP paths | protected source owner kept |
| generated `api.communityExperience` namespace | deleted | disappeared with the file | `DELETE COMPLETE` |
| legacy public access/join identities | four source/facade registrations deleted | zero first-party runtime callers; canonical slug identities remain | `DELETE COMPLETE` |
| private plugin-manifest import subsystem | three source/facade identities, two internal actions, one developer-app upsert, compiler, contract, and four obsolete proofs deleted | zero runtime callers; the promised picker UI was already absent and its proof failed; canonical app connection/setup remains | `DELETE COMPLETE` |
| facade-specific structural proofs | eight scripts reduced | now check source/outer-facade authority or enforce facade absence | complete |
| `communityExperienceMode` route state | unrelated UI mode name | active onboarding-preview route state | `KEEP`; do not confuse it with the Convex facade |

Of the 57 former intermediate aliases, 55 remained after direct-source rewiring
and two are now deleted as separate legacy public identities. `community.ts`
imports retained operations directly from their three source owners. Runtime
and generated API source no longer registers `communityExperience`. The only
intentional source-path reference is a guard that fails if the retired file
reappears. `communityExperienceMode` remains an unrelated active UI route-state
name.

This proves that the intermediate facade has no first-party product job. It
does not prove that an unknown external Convex client has never called its
public namespace.

## Why the source modules stay

Deleting `communityExperience.ts` is not permission to delete its sources:

- `communityResources` owns protected resource, ingestion, builder, runtime,
  and MCP behavior;
- `communityPublic` owns public funnel, presence, discovery, and join behavior,
  and `communityReadKernel` calls its registered discovery query;
- `communityAccessQueries` owns authenticated access projections;
- `community.ts` is the current first-party web and cached-client wire surface.

The first slice removes one registration hop, not product capability.

## Outer-facade follow-up candidates

The corrected static scan found 118 of the original 146 `community.ts` aliases
referenced by first-party runtime code. The earlier 115 count missed dynamic
`api.community.*` callers for `crawlWebRoot`,
`getMyCommunityAgentDockTranscript`, and `getMyCommunityAgentDockTurn`.
The later AI Feed simplification replaced two referenced aliases with one,
leaving 117 referenced aliases and 23 candidates. Deleting the two proven
unused public agent-transport aliases left 117 referenced aliases and 21
outer aliases. Deleting two obsolete admin-read aliases leaves 117 referenced
aliases and 19 aliases with no first-party caller:

| Source area | No first-party `community:*` caller found |
| --- | --- |
| membership/admin | `unbanCommunityUser` (`KEEP`: reversible moderation recovery) |
| resource/builder/source | `listCommunityResourceBuilderDirectory`, `stageCommunityResourceBuilderChangeset`, `readCommunityResourceBuilderResource`, `writeCommunityResourceBuilderResource`, `editCommunityResourceBuilderResource`, `ingestCommunitySourceFiles`, `ingestCommunitySourceGitHub`, `ingestCommunitySourceGoogleDrive` |
| destructive lifecycle compatibility | `deleteCommunity` |
| intelligence/compiler | `createCommunityIntelligenceChangeRequest`, `listCommunityIntelligenceChangeRequests`, `decideCommunityIntelligenceChangeRequest`, `applyCommunityIntelligenceChangeRequest`, `listCommunityIntelligenceDirectoryView`, `listCommunityIntelligenceEdges`, `listCommunityIntelligenceMutations`, `runCommunityCompilerDigestPass`, `listCommunityCompilerDigests` |

Of these 19 aliases, `unbanCommunityUser` and `deleteCommunity` are resolved
`KEEP` surfaces: active Ban must be reversible, and community deletion must
retain its deterministic quarantine identity. The remaining 17 belong to
protected resource or compiler surfaces and require separate confirmation.

## External compatibility boundary

Validated:

- no first-party runtime calls the `communityExperience` namespace;
- the web uses `community:*`;
- official MCP/resource runtime paths use explicit source-module functions;
- no generic first-party proxy was found that forwards arbitrary Convex
  function names;
- the intermediate facade has no schema, database, provider, scheduler, UI, or
  authority ownership.

Unresolved:

- Convex source registration makes the namespace technically callable by an
  external client;
- repository source cannot prove an external client inventory or historical
  access-log absence.

No telemetry table, compatibility shim, or deprecation engine should be built
for this. Before a production port, either obtain bounded function-usage
evidence or explicitly decide that the undocumented namespace was never a
supported external contract. Staging deletion can be exercised independently.

## Elon algorithm

| Requirement | Idiot index | Decision |
| --- | ---: | --- |
| preserve resource/public/access capability | 0 | keep |
| preserve `community:*` first-party wire compatibility in this slice | 1 | keep |
| preserve a 57-function intermediate facade with no first-party caller | 10 | delete |
| keep the facade “just in case” without a named external contract | 9 | reject |
| build telemetry/workflow machinery before staging deletion | 9 | reject |
| delete all 19 remaining unreferenced outer aliases in the same slice | 8 | reject; two keep, 17 protected |

## First completed deletion unit

One bounded staging-only change completed:

1. import the 57 functions directly into `community.ts` from
   `communityAccessQueries`, `communityPublic`, and `communityResources`;
2. delete `convex/communityExperience.ts`;
3. remove facade assumptions from the eight structural proof scripts;
4. regenerate Convex types and prove that `api.communityExperience` is the
   only deleted namespace while all `api.community.*` signatures remain;
5. run the relevant public-funnel, access, resource, ingestion, identity,
   foundation, typecheck, and web-build gates;
6. deploy only to development staging and exercise public funnel plus signed-in
   resource reads.

No schema, data migration, provider, UI behavior, community capability,
production query, production deployment, or generic compatibility machinery.

The generated API pass also repaired one pre-existing stale binding for the
already-tracked `communityDerivedEvidenceReadability` module. It did not add a
new implementation or change this slice's boundary.

## First deletion validation receipt

- all 146 `community.ts` exported function names are byte-for-byte unchanged;
- all eight focused facade-adjacent proofs pass;
- Convex TypeScript passes;
- the 40-step foundation baseline passes;
- web TypeScript and the production web build pass;
- `git diff --check` passes;
- development Convex reports functions ready on
  `dev:quick-porcupine-949`;
- anonymous `https://polynet-staging.vercel.app/c/public-funnel-preview-20260308`
  loads the shared community shell and correctly gates chat;
- signed-in `/c/polynet/chat` loads community threads and manager controls;
- signed-in `/c/polynet/resources` loads the directory and a selected resource
  body;
- both staging browser sessions reported zero console errors;
- no join, post, payment, resource, schema, data, or production mutation was
  performed.

The first deletion unit was later pushed at `dfea05f5`; its Staging UI Canary
passed, and a newly published dependency advisory was closed separately at
`81d68ab8`, restoring both staging workflows to green.

## Second completed deletion unit

One additional bounded staging-only change removes two obsolete semantic
entrypoints and four registered Convex functions:

1. delete the mixed anonymous/authenticated
   `resolvePublicCommunityAccessBySlug` query from `communityPublic` and its
   `community.ts` alias;
2. delete the internal-ID `joinPublicCommunity` mutation from
   `communityPublic` and its `community.ts` alias;
3. retain anonymous funnel content through `resolvePublicFunnelBySlug`,
   authenticated access through `getMyCommunityAccessBySlug`, and admission
   through `joinPublicCommunityBySlug`;
4. migrate all 14 behavioral test calls from the deleted ID mutation to the
   slug mutation without changing the shared join kernel;
5. make the existing funnel and visitor proofs own permanent absence of the
   retired identities;
6. correct the outer-alias inventory from the false 115/31 split to 118/28
   before deletion and 118/26 afterward.

No compatibility shim, public UI, schema, data migration, provider, scheduler,
production query, or production deployment was added.

## Second deletion validation receipt

- 72 source lines were deleted from `communityPublic.ts` and `community.ts`;
- all 66 membership/admission behavior tests pass against the slug mutation;
- the focused funnel, visitor-access, and public-identity proofs pass;
- Convex TypeScript and the 40-step foundation baseline pass;
- web TypeScript, production build, and bundle budget pass;
- development Convex reports functions ready on
  `dev:quick-porcupine-949`;
- read-only development function metadata contains exactly the six retained
  source/facade identities for funnel, access, and join;
- `community.js:joinPublicCommunity`,
  `communityPublic.js:joinPublicCommunity`,
  `community.js:resolvePublicCommunityAccessBySlug`, and
  `communityPublic.js:resolvePublicCommunityAccessBySlug` are absent;
- no join, payment, post, resource, schema, data, provider, or production
  mutation was performed.

## Third completed deletion unit

The unused private community plugin-manifest import subsystem is deleted as one
bounded unit:

1. delete `listPrivateCommunityMcpOptions`,
   `addPrivateCommunityMcpApp`, and
   `applyPrivateCommunityPluginManifest` from both their source module and
   `community.ts`;
2. delete the two internal actions used only by the manifest apply loop and the
   developer-app upsert used only by its staging action;
3. delete the standalone manifest compiler, its active-but-unimplemented
   contract, four dedicated proof scripts, and their package commands;
4. remove the obsolete proof-specific legacy-provider scan exclusion;
5. make the existing MCP app architecture proof own permanent absence of the
   retired import surface and continued presence of canonical app
   connection/setup.

The reviewed MCP registry, `connectCommunityApp`,
`setupImportedCommunityMcpApp`, existing mounted app state, imported-app
configuration, user-owned harness state, and official Polynet MCP remain.

## Third deletion validation receipt

- the retired picker UI already had zero source call path and its dedicated
  proof failed because the promised gateway/controller surface was absent;
- the six removed Convex source functions had no runtime caller outside the
  deleted subsystem;
- the manifest compiler and its contract/proofs had no other consumer;
- the focused MCP app architecture proof passes with explicit absence and
  retained-path assertions;
- Convex TypeScript passes;
- all focused app, registry, harness, identity, and provider guards pass;
- the 40-step foundation baseline, web TypeScript, production build, and bundle
  budget pass;
- development Convex reports functions ready on `dev:quick-porcupine-949`;
- read-only development function metadata contains only the five reviewed
  retained identities in this slice:
  `community:connectCommunityApp`,
  `community:setupImportedCommunityMcpApp`,
  `communityAppMounts:connectCommunityApp`,
  `communityAppMounts:setupImportedCommunityMcpApp`, and
  `developerApps:configureImportedMcpDeveloperAppInternal`;
- `community.ts` now exports 141 aliases: 118 referenced plus 23 separately
  classified follow-up candidates;
- no schema, data, provider, current app UI, official MCP behavior, or
  production target changed.

## Fourth completed deletion unit

Public `readCommunityRecentContext` and
`publishCommunityAiFeedAgentPost` source/facade registrations are deleted.
Their internal functions and shared authorized executors remain, and the
existing worker-bridge and AI Feed evidence proofs enforce the boundary.

Validation passed focused proofs, Convex TypeScript, the 40-step foundation
baseline, web TypeScript, production build, and bundle budget. Development
metadata moved from 907 to 903 functions with exactly those four removals and
zero additions. No UI, schema, data, provider, scheduler, public MCP behavior,
or production target changed.

## Fifth completed deletion unit

The superseded unpaginated `listCommunityMembershipsAdmin` query and unused
`communityOwnerHasArchitectAccess` client preflight are deleted from their
source and facade registrations. The active paginated roster remains the sole
member-directory read, and authorization stays inside canonical operations.
Existing admin and public-identity guards enforce the deletion while retaining
Ban and Unban as distinct reversible moderation operations.

## Verdict

`communityExperience.ts`, four legacy public access/join registrations, and the
unused private plugin-import subsystem, public agent-transport wrappers, and
obsolete admin-read wrappers are deleted on the staging lane.
Canonical anonymous funnel, authenticated access, slug-owned admission,
community app connection/setup, registry policy, recent-context retrieval,
AI Feed publication, and official MCP behavior remain.

Do not bulk-delete the 19 remaining no-caller aliases. Two are resolved keep
surfaces and the remaining 17 cross protected resource/compiler boundaries.
