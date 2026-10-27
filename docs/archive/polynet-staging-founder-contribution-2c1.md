# Slice 2C1: independent founder contribution and retry proof

Status: passed on staging after the founder's explicit go. One labeled synthetic
contribution is retained; no runtime source or deployment changed. See the
[dated receipt](../receipts/2026-10-14-staging-founder-contribution-2c1.md).

## Ground truth and 2B3 review

Checked October 14, 2026:

| Boundary | Verified state |
| --- | --- |
| Canonical main | `0a100cfb544851ab06da25f93d8ad549db917ee4` |
| Serving staging runtime / Git staging | `09e1ca37e7ae0dd3fc48d4cf249526b5ea4c30bc` |
| Clean 2B3 source and receipt head | `1e50b72b1edf4c964acbea2adfa7806c710a1a87` |
| Backend | Inherited `dev:quick-porcupine-949`; unchanged source tree `9dd6ee743bd4869c68047283d38e457bdf600058` |
| Production web | `91d28dc2c986ef88a8a507a269db710d6d28d878`, unchanged |
| 2B3 checks | Exact-runtime, initial PR and final receipt-head release gates passed; 1,681 tests across 192 files in the runtime gate |
| Review checks | 34 auth deadline/logout tests and four selected canonical contribution/authority/recovery tests passed again |

No blocking regression was found in the reviewed 2B3 change. Its one private
helper retains the ten-second deadline through body consumption and clears it
in `finally`; HTTP classification, confirmed-only logout and the reused origin
guard retain their behavior. Dead wiring is deleted rather than deprecated.
The backend tree is unchanged. See the
[2B3 receipt](../receipts/2026-10-14-staging-auth-cleanup-2b3.md).

Evidence remains bounded: stalled-network/retry tests are local simulations;
normal web login, expiry/refresh and canonical revocation were observed live.
The [2B2 receipt](../receipts/2026-10-14-staging-external-oauth-2b2.md) proves native
external OAuth enrollment/continuity on the inherited backend, not content
writes. Its test credentials were removed, so a new test alias must enroll.
CI success is not an independent human/code review; PR #170 remains draft.

## Step 1: requirements and effort ranking

The required outcome is one external client committing a contribution on behalf
of its authenticated founder, recovering an unacknowledged result, and reading
exactly one correctly attributed canonical contribution.

Rankings are qualitative effort estimates, not measured idiot-index ratios.

| Requirement / candidate | Source and credible minimum | Rank |
| --- | --- | --- |
| Commit, recover, read and count one contribution | Headless-founder vision and canonical write contract; native OAuth transport plus one saved request envelope | KEEP; required |
| Same actor/community/key/payload across restart | Current authority and receipt contracts; bind the envelope to the staging resource and canonical user fingerprint | KEEP; required |
| Reject changed payload and inaccessible-community write | Idempotency and per-request access invariants; one conflict and one existing denial fixture | KEEP; required |
| New REST API, SDK, auth broker or credential store | No demonstrated dependency; five canonical MCP tools and native credential owner already exist | Highest avoidable effort; exclude |
| New founder React app or general client framework | The first proof needs one independent client path; existing native app-server can drive it without Polynet App.tsx | High avoidable effort; exclude |
| Backend crash injection, owner revocation or new communities | Not needed for the selected lost-result proof; existing local crash tests and live denial fixture cover separate boundaries | Exclude from this slice |
| Resource changesets, publication, replies or progress transitions | Different domain jobs and authority; one channel root is sufficient | Defer |

Step 2 excluded the broad smoke runner, credential copying, a new client
framework and unnecessary write branches. Step 3 used the existing native
transport and canonical owners to complete the surviving proof.

## Existing mechanism to reuse

`httpMcp.ts` resolves the authenticated caller and invokes the canonical executor
as `external_mcp`. `polynetCanonicalExecutor.ts` resolves current community and
channel access, reserves an operation receipt against the normalized request,
then delegates to `communityInteractions.createCommunityInteractionComposerMessage`.

Two existing owners are necessary: operation receipts preserve request/result
identity and conflicts; the domain mutation independently deduplicates committed
content for recovery after a receipt interruption. Do not collapse these merely
because both use an idempotency key. The operation receipt is scoped by
community, user, principal, tool and key. Its executing lease is 60 seconds and
`operation_in_progress` exposes `retry_after_ms`.

The receipt principal is `external_mcp`; persisted content uses `personal_agent`
with the authenticated founder's canonical user and personal-agent identity.
This is existing attribution, not the autonomous community-owned agent. Human-only
contribution workflows and concierge intake are not triggered by this path;
successful posting does not certify workflow progress or accepted intelligence.
Evidence synchronization/retrieval receipts are normal bounded side effects.

## Execution order and acceptance

1. Reconcile clean source, served staging SHA/backend and main/production identity
   again. Use a new `codex/staging-founder-contribution-2c1` branch from the 2B3
   receipt head in the existing staging worktree. Default to no runtime release.
2. Reuse native Codex app-server enrollment and process isolation from 2B2 with
   the distinct alias `polynet_2c1_staging`. Keep credentials in native Keychain;
   invoke direct native RPC, not an inference turn or administrative bootstrap.
3. Confirm canonical profile and builder/owner self-context on the existing
   synthetic `join-refresh-qa-sep23` community. Discover its writable general
   channel through canonical list/read. Recheck profile readiness, current
   community/channel authority and the denial fixture before any write.
4. Capture a bounded read-only canonical baseline. Persist one synthetic operation
   envelope before dispatch: exact staging resource, canonical identity
   fingerprint, channel path, `mode: create`, content and a unique key of at most
   200 characters. Use a fresh run identifier as well as source provenance so a
   rerun cannot silently replay an older acceptance contribution.
5. Call `polynet_write` once with a plain synthetic marker such as
   `POLYNET_2C1_CONTRIBUTION_<run-id>: Synthetic staging contribution and retry proof.`
   Include no links, mentions, attachments, replies or builder resource operations.
   Deliberately discard its completed response before the proof client adopts
   the returned path/ref. Record that the transport completed, but do not feed
   the first result or canonical observer data into recovery.
6. Fully terminate and restart the native test process with the same alias/store.
   Reload the saved envelope; require the same caller fingerprint without another
   login. Retry the exact request/key. Require `deduped: true`, the original
   canonical ref/path, completed operation receipt and exactly one matching root.
   Honor bounded `retry_after_ms` only if returned; stop at a declared overall
   recovery budget instead of retrying indefinitely.
   Bind the tool caller explicitly to that process and thread. A closure over
   mutable scratch-session bindings can retain the terminated client; the live
   proof corrected this helper defect before issuing the recovery write. Use
   a finite request deadline and stop dependent steps after a failed gate.
7. Read the returned canonical path through `polynet_read`. Require exact marker,
   community/channel and founder-bound personal-agent attribution. Corroborate
   one root, its content blocks and one scoped completed operation receipt using
   read-only metadata. Use indexed lookups and hashed IDs; exclude secrets,
   attempt tokens, opaque sessions and unrelated content from evidence.
8. Reuse the key with changed text and require `idempotency_key_conflict`, with
   the original content/count unchanged. Attempt one write with a separate key
   to the existing inaccessible `public-funnel-preview-20260308` community;
   require `semantic_not_found` and no matching content/operation receipt there.
9. Native logout removes only the test alias credentials. Verify absence and
   protected-call denial in a fresh process; preserve the user's configuration,
   memberships, ownership and the previously revoked 2A fixture. Retain the one
   synthetic contribution and receipts as labeled staging audit history.
10. Save a dated Markdown/JSON receipt with exact identities, request fingerprint,
    marker/key, timestamps, restarted process evidence, returned path/ref,
    canonical counts, negative controls and cleanup. Recheck main/production.

## Change and verification budget

Reuse the existing client transport and contribution assertions. The legacy
external smoke script already has write/retry/read assertions, but its acceptance
mode also exercises broader operations and expects bearer credentials. Do not
run that broad mode or copy credentials out of Keychain for this proof. Prefer
one small local driver using the proven native app-server; add a durable helper
only if needed to make recovery and its assertions reproducible.

Run focused canonical executor/receipt/domain checks and MCP contract proofs for
the touched seam. Reuse the existing local receipt-completion crash tests; their
current chat cases use `personal_agent`, so they do not certify a live external
backend crash. Add a principal-specific case only when required by a discovered
coverage gap. Runtime changes require relevant typechecks and the canonical gate
before an explicitly targeted staging release; receipt-only work needs no deploy.

If a gate fails, stop dependent steps and identify the smallest demonstrated
seam before fixing it. Do not widen into an API/SDK rewrite or pagination cleanup.

The live lost-result case discards a completed response at the proof application
boundary; it does not simulate a TCP interruption or crash staging services.
Inaccessible-community denial is not positive-then-revoked founder-write proof:
owner authority survives membership removal, and this slice changes neither.
Production, billing, provider configuration, progress execution, accepted-memory
publication, resource edits and a second client compatibility matrix are outside
this slice. This proves one headless contribution rail, not an entire custom
founder application.
