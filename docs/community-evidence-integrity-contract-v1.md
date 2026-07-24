# Community Evidence Integrity Contract v1

## Purpose

Community memory may use raw platform evidence only when the exact evidence
version reviewed remains canonically readable at the moment a memory change is
applied.

## Canonical layers

1. Interactions, Resources, AI Feed posts, and operational source traces are
   canonical source records.
2. Archive/vector rows are rebuildable search candidates only. They never grant
   visibility or admissibility.
3. `communityEvidenceCitations` records an immutable source ref, opaque source
   version, content hash, provenance hash, visibility snapshot, and capture
   time. It stores no raw source content.
4. `communityIntelligenceChangeRequests` is the immutable validation and audit
   ledger. It is not a routine approval gate for compiler memory.
5. Retained nodes and edges carry the exact citation ids validated during their
   atomic apply.

## Resolution

All current platform evidence uses one typed ref namespace:

- `interaction:root:<id>`
- `interaction:reply:<id>`
- `resource:<id>`
- `ai_feed:<id>`
- `trace:<id>` for operational/manual trace fallback

The typed ref selects the only table an id may resolve against. The resolver
validates source/community identity, parent identity, member evidence
visibility, and modality lifecycle. Public callers must not distinguish a
foreign, hidden, deleted, or nonexistent source.

## Citation lifecycle

- Capturing the same ref/version/hashes reuses the existing citation.
- The same ref/version with different hashes is an integrity error.
- Editing a source creates a new admissible version and supersedes the old
  citation for future application.
- Hiding or deleting a source revokes its citation for future application.
- Citations are immutable and are never rewritten to point at a newer source
  version.
- Source-trace state is only a cache. Derived reads resolve the trace back to
  the current canonical source, so deletion or hiding is effective before
  asynchronous trace synchronization runs.

## Derived-read revocation

- Every evidenced node rechecks its current source traces; `citation_v1` nodes
  also require every retained citation to remain active.
- Legacy evidenced nodes may remain auditable only while their source traces
  still resolve to readable canonical evidence. Unprovable legacy chat traces
  fail closed.
- Member memory, manager directory/edges, compiler handoff, manager digest and
  change-request reads, and the community-agent filesystem share this rule.
- A revoked digest cannot be claimed by the community agent. Manager audit
  projections retain structural identity while redacting copied item or
  request payload content.
- These reads are bounded. Directory and edge projection do not collect an
  entire community table before applying the revocation rule.

## Change-request enforcement

- New source-backed memory changes use `evidencePolicyVersion=citation_v1`.
- Their source traces are resolved into immutable citations at proposal time.
- Apply time resolves every citation again and compares source version,
  content hash, provenance hash, and visibility.
- Revoked, superseded, malformed, or cross-community evidence fails the entire
  apply transaction.
- Agent/compiler/system evidence must be community/public and non-redacted.
- A memory artifact cannot be broader in visibility than either its retained
  citations or the current request's citations.
- Full recapture replaces superseded citation versions instead of accumulating
  them; partial attachment requires retained v1 citations to remain active.
- `observed`, `measured`, or `validated` evidence strength requires at least one
  citation.
- Compiler-derived `create_node` memory may validate and apply atomically in one
  transaction. This removes acceptance choreography, not evidence enforcement.

## Legacy compatibility

- Existing nodes without citation ids project as `legacy_unversioned`; the
  system must not fabricate historical citations for them.
- Evidence-sensitive changes to a legacy evidenced node require a citation
  review first.
- Attaching evidence can upgrade a legacy node to `citation_v1` only when the
  request recaptures every existing source trace.
- Legacy chat edit/delete mutations remain temporary adapters. When a legacy
  link exists, they edit or tombstone the canonical interaction in the same
  database transaction.

## Explicit non-goals

This contract does not add Events or transcripts, remove public tool aliases,
define cross-community personal-agent search, or claim physical privacy
erasure. An accepted memory becomes immediately unreadable when its evidence
is revoked; the later C2 physical-purge phase must still scrub retained source,
digest, request, mutation, and storage copies.
