# Community Evidence Integrity Contract v1

## Purpose

Community memory may use raw platform evidence only when the exact evidence
version reviewed remains canonically readable at the moment a memory change is
applied.

## Canonical layers

1. Interactions, Resources, and operational source traces are canonical sources
   for new evidence. Retired AI Feed posts remain historical source records only.
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
- Existing AI Feed citations remain resolvable for audit and migration, but
  direct `ai_feed:` refs and `sourceType=ai_feed` traces cannot create new
  citations or memory proposals.

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
define cross-community personal-agent search, or decide whether an already
accepted memory must be erased after its source is later deleted. It prevents
invalid evidence from moving forward and exposes legacy lineage honestly.
