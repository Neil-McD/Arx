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

## Resource-content dual authority

`communityResources` still has optional `bodyMd`, `bodyChars`, `bodyHash`, and migration metadata, while `communityResourceContents` is the intended content owner. `communityResourceContent.ts:34-72` reads legacy inline body first, then the content table. Writers generally write the content table and clear inline body.

`communityResources.ts` still contains multiple direct `row.bodyMd` reads and a manager-gated public `compactCommunityResourceBodyStorage` mutation. The compactor collects all community resources and slices candidates (`:5690-5739`), so its write bound does not bound its read cost. Until every reader uses the helper and live inline-body prevalence is zero, this is a dual-truth migration.

Correct closure: bounded prevalence -> normalize readers -> cursor migration with receipts -> parity proof -> disallow inline writes -> remove public compactor -> remove legacy fields.

## Interaction/evidence coupling

Canonical interaction writes schedule evidence synchronization. Legacy chat readers still feed archive/context/digests and backfill. Privacy or account deletion must define whether source traces and accepted intelligence are deleted, redacted, tombstoned, or retained when their contributing interaction is purged. Otherwise the intelligence layer can re-project deleted content.

## Legacy fields and compatibility

- `communityEvidenceRetrievalLogs.query` and `communityIntelligenceRetrievalLogs.query` remain optional schema fields while current writers avoid raw query storage. They are retention/privacy migration candidates.
- `communityIntelligenceDirectory` labels older evidence as `legacy_unversioned` when source trace IDs exist without current citation state. This is legitimate read compatibility until a bounded migration proves all retained nodes versioned.
- source ingestion supports URL, file, Drive, GitHub, crawl jobs, content units, lineage, and evidence. These are separate acquisition adapters around the same canonical resource/evidence spine, not automatically duplicate products.

## Scale and reliability

| Path | Risk |
| --- | --- |
| resource body compaction | full community collect before bounded write batch |
| ingestion/crawl | page/unit/cardinality and provider cost must remain bounded and receipted |
| compiler/retrieval | context size and source fan-out need explicit limits; current architecture has bounded selectors in many paths |
| memory sweep | first 500 communities only with no cursor; later communities can starve forever |
| evidence retention | unbounded historical receipts without a stated retention/archive policy |

## Reduction candidates

| Candidate | Classification | Action | Idiot index | Rationale |
| --- | --- | --- | ---: | --- |
| canonical resource/evidence/compiler/intelligence spine | `KEEP (MVP core)` | `HARDEN` | 0 | protected and physically required for collective intelligence |
| inline `communityResources.bodyMd` authority | `DECISION REQUIRED (user confirmation)` | `OBSERVE_FIRST`, `MIGRATE_THEN_DELETE` | 8 | replacement exists; legacy readers/data must reach zero first |
| public full-collect resource body compactor | `DECISION REQUIRED (user confirmation)` | `MIGRATE_THEN_DELETE`, `BOUND` | 8 | temporary migration machinery should not become a permanent product API |
| raw optional retrieval-query legacy fields | `DECISION REQUIRED (user confirmation)` | `OBSERVE_FIRST`, `MIGRATE_THEN_DELETE` | 7 | current privacy posture avoids them; retained rows may still need scrubbing |
| `legacy_unversioned` intelligence evidence state forever | `DECISION REQUIRED (user confirmation)` | `OBSERVE_FIRST`, `MIGRATE_THEN_DELETE` | 6 | compatibility is justified only until retained nodes are migrated |
| protected source adapters as a blanket deletion target | `KEEP (MVP core)` | `CONSOLIDATE` | 2 | ingestion adapters differ by provider but should converge on one source contract |

## Correct optimization order

Do not optimize compiler or retrieval algorithms while resource/interaction authority remains dual. First close content and interaction migrations, then measure retrieval cost/quality, then consolidate provider adapters around the canonical source contract, and only then optimize indexing/context size.
