# Community Convex Facade Reduction Map — 2026-07-24

- Status: `COMPLETE` on the local staging worktree and development Convex;
  GitHub staging-branch push pending explicit egress approval
- Mapping source: `cee60b5582c31436a5f1601ddfc5ec236e865dd7`
- Implementation base: `a436865efcb600b552cd7b44e2a1f87de53a6847`
- Worktree:
  `/Users/neilmcdevitt/code/arx/.worktrees/semantic-platform-staging-20260719`
- Branch: `codex/semantic-platform-staging-20260719`
- Product, schema, data, provider, UI, and production changes: none
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
| `convex/community.ts` | 146 registered aliases | 115 aliases referenced across 19 runtime source files; web gateways use `community:*` | `KEEP` as the current web/cached-client facade; reduce per alias later |
| `convex/communityExperience.ts` | deleted | zero `api.communityExperience.*` or `communityExperience:*` runtime calls | `DELETE COMPLETE` |
| `communityAccessQueries` | 2 former intermediate aliases | imported directly by `community.ts` | source owner kept |
| `communityPublic` | 10 former intermediate aliases | imported directly by `community.ts`; source has an internal runtime consumer | source owner kept |
| `communityResources` | 45 former intermediate aliases | imported directly by `community.ts`; source is used by runtime and official MCP paths | protected source owner kept |
| generated `api.communityExperience` namespace | deleted | disappeared with the file | `DELETE COMPLETE` |
| facade-specific structural proofs | eight scripts reduced | now check source/outer-facade authority or enforce facade absence | complete |
| `communityExperienceMode` route state | unrelated UI mode name | active onboarding-preview route state | `KEEP`; do not confuse it with the Convex facade |

All 57 former intermediate aliases remain exported by `community.ts`, which
now imports them directly from their three source owners. Runtime and generated
API source no longer registers `communityExperience`. The only intentional
source-path reference is a guard that fails if the retired file reappears.
`communityExperienceMode` remains an unrelated active UI route-state name.

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

Static scanning of 780 runtime source TypeScript/JavaScript files, excluding
generated and built artifacts, found 115 of the 146 `community.ts` aliases
referenced by first-party runtime code. The remaining 31 outer aliases require
a separate compatibility decision:

| Source area | No first-party `community:*` caller found |
| --- | --- |
| membership/admin | `listCommunityMembershipsAdmin`, `communityOwnerHasArchitectAccess`, `unbanCommunityUser` |
| recent context | `readCommunityRecentContext` |
| resource/builder/source | `listCommunityResourceBuilderDirectory`, `stageCommunityResourceBuilderChangeset`, `readCommunityResourceBuilderResource`, `writeCommunityResourceBuilderResource`, `editCommunityResourceBuilderResource`, `crawlWebRoot`, `ingestCommunitySourceFiles`, `ingestCommunitySourceGitHub`, `ingestCommunitySourceGoogleDrive` |
| public access | `resolvePublicCommunityAccessBySlug`, `joinPublicCommunity` |
| interaction/AI Feed | `getMyCommunityAgentDockTranscript`, `getMyCommunityAgentDockTurn`, `publishCommunityAiFeedAgentPost` |
| destructive lifecycle compatibility | `deleteCommunity` |
| private app/MCP capability | `listPrivateCommunityMcpOptions`, `addPrivateCommunityMcpApp`, `applyPrivateCommunityPluginManifest` |
| intelligence/compiler | `createCommunityIntelligenceChangeRequest`, `listCommunityIntelligenceChangeRequests`, `decideCommunityIntelligenceChangeRequest`, `applyCommunityIntelligenceChangeRequest`, `listCommunityIntelligenceDirectoryView`, `listCommunityIntelligenceEdges`, `listCommunityIntelligenceMutations`, `runCommunityCompilerDigestPass`, `listCommunityCompilerDigests` |

These are alias candidates, not capability-deletion candidates. Several source
implementations have internal, MCP, scheduled, proof, or cached-client jobs.
`deleteCommunity` must retain its deterministic quarantine identity until that
cached-client contract is deliberately retired.

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
| delete all 31 unreferenced outer aliases in the same slice | 8 | reject; classify separately |

## Completed deletion unit

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

## Validation receipt

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

The GitHub staging branch remains behind the local worktree because the
external push was safety-blocked pending a new explicit GitHub-egress approval.

## Verdict

`communityExperience.ts` is deleted and validated on the staging lane. The
change removes 57 callable identities and one 65-line facade while preserving
every current first-party `community:*` route and every source authority.

Do not combine it with the 31 outer-alias decisions. Deletion of the provably
ownerless intermediate hop is complete; the larger public surface is the next
separate decision area.
