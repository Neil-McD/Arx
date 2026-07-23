# Domain Dossier — Resources, Evidence, Compiler, Memory, and Intelligence

## Protected irreducible job

Turn permissioned community sources and interactions into durable, attributable community knowledge that can be retrieved and evaluated without making model output canonical truth. Community resources, memory, compiler, cognition, and reference context are explicitly protected.

## Canonical spine

```text
source/resource or canonical interaction
  -> source trace and content identity
  -> evidence/citation blocks
  -> compiler digest/change request
  -> policy/acceptance
  -> intelligence directory node
  -> bounded retrieval receipt
  -> outcome receipt and later evaluation
```

The design correctly separates raw source, evidence, candidate change, accepted intelligence, retrieval, and outcome. Digests, prompts, archives, rankings, and runtime context are projections; they do not overwrite evidence or accepted state.

The retired community-agent cycle ledger has already been removed with an acceptance record. That is a good precedent: canonical replacement, staging proof, explicit retirement, then schema closure.

## Resource-content authority

C3.1A closed the resource-body migration on development staging.
`communityResources` owns identity, metadata, and the derived `bodyChars` list
projection. `communityResourceContents` is the sole durable Markdown/hash
owner. The expectation-locked migration moved the two remaining inline-only
bodies, preserved both resource timestamps, and replayed with zero work. A
second expectation-locked checkpoint removed all 10 legacy parent
hash/migration projections.

The final complete audit found 10 resources, 10 content rows, and zero inline
fields, duplicates, orphans, cross-community rows, hash/length mismatches,
missing content, bodyless-content contradictions, or parent counter
mismatches. The reader uses a two-row duplicate detector and fails closed on
missing, malformed, cross-community, or projection-mismatched content. The
public compactor and both temporary internal migrations are absent.

The remaining resource-scale debt is separate: `listCommunityResources`
collects every community resource and hydrates every body before slicing.
C3.1B should make this path bounded and metadata-only, with selected content
read on demand.

## Interaction/evidence coupling

Canonical interaction writes schedule evidence synchronization. Legacy chat readers still feed archive/context/digests and backfill. Privacy or account deletion must define whether source traces and accepted intelligence are deleted, redacted, tombstoned, or retained when their contributing interaction is purged. Otherwise the intelligence layer can re-project deleted content.

## Legacy fields and compatibility

- `communityEvidenceRetrievalLogs.query` and `communityIntelligenceRetrievalLogs.query` remain optional schema fields while current writers avoid raw query storage. They are retention/privacy migration candidates.
- `communityIntelligenceDirectory` labels older evidence as `legacy_unversioned` when source trace IDs exist without current citation state. This is legitimate read compatibility until a bounded migration proves all retained nodes versioned.
- source ingestion supports URL, file, Drive, GitHub, crawl jobs, content units, lineage, and evidence. These are separate acquisition adapters around the same canonical resource/evidence spine, not automatically duplicate products.

## Scale and reliability

| Path | Risk |
| --- | --- |
| resource list | full community collect plus per-row body hydration before bounded response |
| ingestion/crawl | page/unit/cardinality and provider cost must remain bounded and receipted |
| compiler/retrieval | context size and source fan-out need explicit limits; current architecture has bounded selectors in many paths |
| memory sweep | first 500 communities only with no cursor; later communities can starve forever |
| evidence retention | unbounded historical receipts without a stated retention/archive policy |

## Reduction candidates

| Candidate | Classification | Action | Idiot index | Rationale |
| --- | --- | --- | ---: | --- |
| canonical resource/evidence/compiler/intelligence spine | `KEEP (MVP core)` | `HARDEN` | 0 | protected and physically required for collective intelligence |
| inline `communityResources.bodyMd` authority | `DELETE complete` | closed in C3.1A | 10 | 10/10 canonical content rows; schema/read fallback removed |
| public full-collect resource body compactor | `DELETE complete` | closed in C3.1A | 10 | temporary migration and registered function removed |
| full-collect, body-hydrating resource list | `KEEP (MVP core)` | `BOUND`, `HARDEN` in C3.1B | 8 | correct authority, avoidable read amplification |
| raw optional retrieval-query legacy fields | `DECISION REQUIRED (user confirmation)` | `OBSERVE_FIRST`, `MIGRATE_THEN_DELETE` | 7 | current privacy posture avoids them; retained rows may still need scrubbing |
| `legacy_unversioned` intelligence evidence state forever | `DECISION REQUIRED (user confirmation)` | `OBSERVE_FIRST`, `MIGRATE_THEN_DELETE` | 6 | compatibility is justified only until retained nodes are migrated |
| protected source adapters as a blanket deletion target | `KEEP (MVP core)` | `CONSOLIDATE` | 2 | ingestion adapters differ by provider but should converge on one source contract |

## Correct optimization order

Do not optimize compiler or retrieval algorithms while interaction authority remains dual. Resource-body authority is closed; next bound its list/read projection, then close interaction migration, measure retrieval cost/quality, consolidate provider adapters around the canonical source contract, and only then optimize indexing/context size.
