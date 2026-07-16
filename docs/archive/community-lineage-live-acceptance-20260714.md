# Community Lineage Live Acceptance — 2026-07-14

> Historical certificate. The temporary deployed acceptance action used by
> this run has been removed; active proofs now target canonical runtime paths.

Status: passed
Deployment: `neil-mcdevitt:polynet:dev/lineage-evidence-20260714`
Deployment name: `basic-robin-885`
Run: `integration-20260714-b`
Isolation: dedicated empty Convex dev deployment with a two-day expiration

## Scope

This certificate validates the canonical interaction evidence and lineage path
without using the shared `quick-porcupine-949` data deployment.

The acceptance action is disabled unless both conditions hold:

- `POLYNET_DEPLOYMENT_KIND=staging`
- `POLYNET_LINEAGE_ACCEPTANCE_ENABLED=1`

The caller must also provide the literal confirmation
`isolated_lineage_acceptance`.

## Fixture

The action created:

- one isolated community owned by a fixture user
- one unrelated outsider with no community entitlement
- one community-visible human root
- one community-visible human reply
- one community-visible autonomous community-agent reply targeting the human
  reply
- one private root containing the same search terms
- one second community and one structurally invalid reply whose parent belongs
  to that community
- one older archive-only root plus 85 newer fillers, forcing the unique
  `zetaquartz` query beyond the recent interaction scan

Canonical synchronization archived the readable interaction records but did
not create source traces or lineage links. The private root and the reply with
the cross-community parent were not indexed. The human root was then explicitly
promoted with `high_signal`; the autonomous agent reply was explicitly promoted
with `agent_signal`. The ordinary human reply remained searchable but
unpromoted.

## Surface Certificate

The acceptance exercised the real adapter path for each surface:

- member personal agent: `executeRetrievalHarnessTool`
- community Concierge: its allowlisted `executeConciergeTool` wrapper
- external MCP: the JSON-RPC `handleMcpPost` HTTP handler

The isolated fixture cannot mint an external identity-provider JWT, so only the
MCP handler's post-auth actor and accessible-community selector were injected.
The evidence action still revalidated the user and community entitlement from
database truth. Full OAuth token issuance is outside this certificate.

All three surfaces searched for `lineage alpha`, received the same three stable
references, and read the same root reference. Each surface produced one search
audit and one read audit.

The member-agent adapter also searched for `zetaquartz` and returned the older
root from the vector archive with:

- `retrieval_source=archive`
- `archive_available=true`
- `archive_error=null`

The archive embedding batch processed and embedded four canonical interaction
documents. Seven total retrieval audit rows were recorded, and none copied the
raw query text.

The human evidence projected direct user authority and credit, root episode
continuity, and `profile_projection=source_only`. The autonomous community-agent
reply projected community authority, agent credit, and a `replies_to` relation
targeting the human reply.

The outsider search failed before returning evidence. A reply ID forged as a
root reference failed closed, as did the reply whose parent belonged to another
community. Broad recent-context retrieval also rejected both that structurally
invalid reply and its foreign-community parent.

## Archive And Promotion Certificate

Before explicit promotion:

- readable interactions had canonical archive documents
- no interaction source trace existed
- no source-trace link existed

After explicit promotion:

- the human root trace retained `actorType=member` and the fixture user, with
  compiler state `pending`
- the community-agent trace retained `actorType=agent` and
  `actorAgentKey=community_agent`, with compiler state
  `excluded_self_authored`
- the ordinary human reply still had no source trace or lineage link
- promotion reasons remained `high_signal` and `agent_signal`

This proves the required boundary: archive/searchability is automatic for
readable canonical evidence; compiler/lineage promotion is explicit.

## Redaction Certificate

The root was hidden, then canonical synchronization and recursive child
redaction ran over canonical replies.

After redaction:

- the two promoted traces had `sourceVisibility=redacted`
- both promoted traces had `compilerState=excluded_by_visibility`
- both source-trace links were removed
- root, promoted child, and unpromoted child archive documents were deleted
- direct read of a child reference failed closed
- the forged root reference continued to fail closed under the hidden parent

The action returned:

```txt
ok=true
code=community_lineage_acceptance_passed
failures=[]
wrongTypeDenied=true
crossCommunityParentDenied=true
recentContextForeignParentDenied=true
hiddenParentTypeConfusionDenied=true
outsiderDenied=true
redactedReadDenied=true
```

## Legacy Archive Deletion Gate

A read-only check of the shared dev deployment found at least five existing
`communityArchiveDocuments` rows with `sourceType=chat`.

Therefore this slice does not remove the legacy `chat` schema literal or
compatibility readers. Direct legacy archive writes are already deleted, but
the paginated canonical interaction evidence backfill must remove remaining
rows before the type and read branches can be deleted safely.

## Integration Status

Resources and AI Feed now have separate passed certificates for the same
canonical evidence contract. Events, member-directory records, and other future
modalities are not certified by this interaction acceptance.
