# Community Convex Facade Reduction Map — 2026-07-24

- Status: `COMPLETE` read-only staging source map; deletion not yet implemented
- Source: `cee60b5582c31436a5f1601ddfc5ec236e865dd7`
- Worktree:
  `/Users/neilmcdevitt/code/arx/.worktrees/semantic-platform-staging-20260719`
- Branch: `codex/semantic-platform-staging-20260719`
- Product, schema, data, provider, deployment, and production changes: none

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
| `convex/communityExperience.ts` | 57 registered re-exports | zero `api.communityExperience.*` or `communityExperience:*` runtime calls | `DELETE CANDIDATE` |
| `communityAccessQueries` through the intermediate facade | 2 aliases | both are re-exported again by `community.ts` | rewire `community.ts` directly |
| `communityPublic` through the intermediate facade | 10 aliases | all are re-exported again by `community.ts`; `communityPublic` itself has an internal runtime consumer | rewire; keep source module |
| `communityResources` through the intermediate facade | 45 aliases | all are re-exported again by `community.ts`; source module is used by runtime and official MCP paths | rewire; protected source module stays |
| generated `api.communityExperience` namespace | 57 callable identities | generated solely because the file exists | delete with the facade |
| facade-specific structural proofs | eight scripts | they read or scan the facade; none is a product caller | rewrite to source/outer-facade authority |
| `communityExperienceMode` route state | unrelated UI mode name | active onboarding-preview route state | `KEEP`; do not confuse it with the Convex facade |

All 57 intermediate aliases are also exported by `community.ts`.
`community.ts` is the only runtime source import of the intermediate module.
The other repository references are generated API typing and structural proof
scripts. A retained-history search found no first-party
`api.communityExperience` or `communityExperience:*` call site.

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

## First deletion unit

One bounded staging-only change:

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

Stop if the generated `community` contract changes, a real first-party caller
appears, a protected source capability must move, or an explicit external
consumer is identified.

## Verdict

`communityExperience.ts` is a high-confidence staging deletion candidate. Its
removal deletes 57 callable identities and one 65-line facade while preserving
every current first-party `community:*` route and every source authority.

Do not combine it with the 31 outer-alias decisions. Delete the provably
ownerless intermediate hop first, verify, then return to the larger public
surface.
