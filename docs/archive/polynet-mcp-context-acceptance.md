# Staging MCP context acceptance (slice 2A)

This is a bounded observation harness for real member and builder credentials.
It targets only `https://polynet-staging.vercel.app/runtime/mcp`. It does not
create fixtures, revoke memberships, enroll OAuth clients, or certify session
refresh/logout. The older `acceptance` mode has broader write behavior; use
`context` and `context-revoked` for this slice.

Slice 2A.1 requires revocation to consume the successful positive run's
versioned JSON. A standalone denial without that linkage is not a revocation
proof. The original 2A live receipt remains historical evidence; this follow-up
changes harness validation and does not claim another live membership removal.

## Requirements and scope

Elon step 1: the founder-approved outcome is evidence that existing canonical
identity and authorization owners work through the deployed external MCP.

| Requirement | Source and reason | Effort versus minimum |
| --- | --- | --- |
| Two real, distinct canonical users | Repository verified-identity invariant; a different token can still represent the same user | Necessary authentication setup |
| Independent positive controls | A nonexistent document or unindexed canary can produce a misleading denial | Necessary fixture setup and reads |
| Exact deployed runtime identity | Package 1 staging receipt; otherwise the result has no release provenance | One version check per run |
| Same valid bearer before/after revocation | Per-request entitlement invariant; token expiry must not explain denial | One bounded membership operation |
| Framework, ontology or runtime redesign | No acceptance requirement depends on redesign | Delete from this slice; highest avoidable effort |
| Inference/chat/changeset exercises | Context authorization can be proved using list/read/search | Delete from this slice |

These are qualitative effort rankings, not measured cost ratios. Step 2 removes
write exercises from the proof and rejects enabled write switches. Step 3 keeps
one harness on top of the existing canonical five-tool surface. No acceleration
or automation expansion is required to establish this outcome.

## Fixture and credentials

1. Select a disposable staging QA community A, owned by the builder, with an
   ordinary member using `free_grant`. Check both membership and community/user
   subscription indexes contain no subscriptions before removal. Use a second
   builder-owned community B that the member cannot access.
2. Through existing domain APIs and builder authority, create synthetic public
   resource and restricted-channel canaries. Publish the resource through its
   live module. Derive exact document paths from canonical IDs and semantic
   path helpers; do not invent semantic filenames. Avoid agent mentions/replies
   and select a fixture with no member workflow automations.
3. Obtain real provider-issued bearers for both users. Administrative identity
   impersonation is not an authenticated acceptance substitute. If existing
   server bootstrap assists credential acquisition, disclose that separately
   from public MCP bearer verification.
4. Keep tokens in owner-only temporary storage and load them into subprocess
   environment variables without shell interpolation, logging, or commits.
   Record hashes and expiration timestamps, then remove temporary credentials.

## Running the proof

Set the following in the process environment from private storage:

| Variable | Meaning |
| --- | --- |
| `POLYNET_MCP_BEARER_TOKEN` | Ordinary member bearer |
| `POLYNET_MCP_CONTROL_BEARER_TOKEN` | Independent builder bearer |
| `POLYNET_MCP_COMMUNITY_SLUG` | Fixture A |
| `POLYNET_MCP_DENIED_COMMUNITY_SLUG` | Control-only fixture B |
| `POLYNET_MCP_PUBLIC_DOCUMENT_PATH` | Exact A resource `.md` path |
| `POLYNET_MCP_PRIVATE_DOCUMENT_PATH` | Exact A restricted-channel interaction `.md` path |
| `POLYNET_MCP_PUBLIC_CANARY`, `POLYNET_MCP_PRIVATE_CANARY` | Distinct synthetic `POLYNET_2A_…` strings |
| `POLYNET_MCP_ACCEPTANCE_RUN_ID` | Full deployed web SHA, distinct from harness commit |
| `POLYNET_MCP_CONTEXT_BASELINE_FILE` | Required for `context-revoked`: JSON stdout from the successful positive run |
| `POLYNET_MCP_WRITE_CHAT`, `POLYNET_MCP_EXERCISE_BUILDER` | Both `0` |

```sh
umask 077
node node_modules/tsx/dist/cli.mjs scripts/polynet_workspace_mcp_external_smoke.ts --mode=context --url=https://polynet-staging.vercel.app/runtime/mcp > /tmp/polynet-context-positive-2a.json
```

Only a successful complete suite emits this baseline. Schema version 1 records
the runtime SHA, exact fixture selectors, distinct canonical identity
fingerprints, member bearer SHA-256 and every positive case's passed status.
No raw tokens, canonical user IDs or retrieved document bodies are emitted.
Older output without this schema is rejected; obtain a new positive run rather
than converting old evidence into a claimed new proof.

The proof verifies distinct server-resolved users, server-derived roles, caller
self-context, resource read/search round trips, builder dossier denial, private
document denial, exact private-channel search denial, no private snippets in
broad member search, and control-proven cross-community denial. Community-wide
chat search deliberately scans shared channels even for builders; its empty
result alone cannot establish private-canary searchability.

After a successful positive run, recheck grant-only/no-subscription conditions
and remove only the selected disposable membership through
`communityAdmin.removeCommunityMember` using the real builder bearer. Record
`stripe_canceled_count: 0` and the canonical revoked membership state. Preserve
the member bearer unchanged and run before it expires:

```sh
POLYNET_MCP_CONTEXT_BASELINE_FILE=/tmp/polynet-context-positive-2a.json node node_modules/tsx/dist/cli.mjs scripts/polynet_workspace_mcp_external_smoke.ts --mode=context-revoked --url=https://polynet-staging.vercel.app/runtime/mcp
```

Global self-profile must still authenticate, all tested A requests must deny,
and the builder resource control must remain healthy. Before network requests,
the harness rejects missing, malformed, failed or mismatched baselines and
requires the unchanged member bearer hash, runtime and fixture. It then reads
both global profiles and requires their canonical identity fingerprints to
match before testing community denials. The builder may refresh its token while
remaining the same canonical control user. Retain fixture history and revoked
membership; reactivation would alter activation history and is not a restoration
of the original state.

Search/read may record retrieval evidence. Fixture setup and revocation are
separate writes; report them explicitly. Do not claim that existing staged
background workers were stopped or that unrelated provider activity was absent.

## Validation and next gate

Focused harness tests reject weak controls, same-user credentials, escaped
paths, leaks, enabled mutation flags and unlinked revocation. Subprocess tests
exercise CLI output/file loading and the actual HTTP adapter with intercepted
synthetic responses; unexpected requests throw and no live service is contacted.
They cover successful baseline reuse, missing/invalid/failed evidence, changed
bearers/users, expired authentication and incorrect denial codes.
Run the canonical executor tests and MCP/auth/profile contract proofs alongside
them. Stamp runtime SHA, harness
revision, executed source hashes, timestamps, token hash/expiry, fixture effects
and limitations in the receipt.

Slice 2B1 separately covers truthful logout and public session lifecycle;
2B2 covers external-client OAuth enrollment and continuity.
An independent founder client remains the next product proof after
those boundaries are established. Production release and broad API redesign
are outside this slice.
