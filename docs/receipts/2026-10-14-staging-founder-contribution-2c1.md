# Slice 2C1: independent founder contribution and retry proof

**Passed on staging, October 14, 2026. Production was untouched.**

One native external client committed a synthetic contribution, discarded its
completed response before adopting the returned result, restarted, and recovered
the same contribution by replaying its saved request. Canonical metadata confirms
exactly one root and one completed operation receipt, unchanged by replay or the
negative controls. No runtime or provider configuration changes were needed.

[Structured evidence](evidence/2026-10-14-staging-founder-contribution-2c1.json).
[Scope and execution runbook](../archive/polynet-staging-founder-contribution-2c1.md).

## Provenance

| Boundary | Verified value |
| --- | --- |
| Parent 2B3 source/receipt head | `1e50b72b1edf4c964acbea2adfa7806c710a1a87` |
| Serving staging runtime / Git staging | `09e1ca37e7ae0dd3fc48d4cf249526b5ea4c30bc`, unchanged |
| Backend | Inherited `dev:quick-porcupine-949`; source tree remains `9dd6ee743bd4869c68047283d38e457bdf600058` |
| Native client | Codex app-server `0.162.0-alpha.17.2`, isolated alias `polynet_2c1_staging`, native Keychain |
| Resource / issuer | `https://polynet-staging.vercel.app/runtime/mcp` / `https://sparkling-artist-49-staging.authkit.app` |
| Canonical main | `0a100cfb544851ab06da25f93d8ad549db917ee4`, not pushed |
| Production web | `91d28dc2c986ef88a8a507a269db710d6d28d878`, unchanged |

Native protocol calls followed the installed generated schema and
[official app-server documentation](https://learn.chatgpt.com/docs/app-server).
No inference turn, administrative credential bootstrap, bearer copying, user
configuration edit or Polynet first-party write UI drove the acceptance.

## Live acceptance

Times below are UTC, October 14, 2026.

| Gate | Observation |
| --- | --- |
| Native enrollment, 20:44:57 | Existing WorkOS browser session completed OAuth once; native notification reported success. Authenticated profile matched the prior 2A/2B2 founder fingerprint. |
| Authority / preconditions | Canonical self-context matched the caller; community directory returned builder/owner; General channel allowed posting. Read-only metadata confirmed profile readiness and a real inaccessible-community control. |
| Saved request, 20:46:52 | Exact endpoint, actor fingerprint, source identity, path, text and unique key persisted before dispatch. Both matching root and receipt counts were zero. |
| Commit / discard, 20:48:22–20:48:23 | Native `polynet_write` completed; application discarded the response without adopting its path/ref. Canonical observer confirmed one root and one completed receipt. |
| Process restart, 20:48:40 | Process `12233` exited; replacement `15222` started with the same endpoint, alias and store. |
| Scratch-helper diagnosis | Two bounded identity reads addressed the stale scratch client binding and timed out before any retry write. A direct read from the replacement process succeeded at 20:52:56. The caller was rebound explicitly to the current process/thread. |
| Identical replay, 20:53:36 | Saved envelope loaded from disk; caller fingerprint matched without login. Replay returned `deduped: true` with the original canonical path/ref and receipt. Canonical root and receipt were unchanged. |
| Committed read-back | `polynet_read` of the returned path contained the exact marker, General channel and founder-bound personal-agent attribution; response was not truncated; no replies, attachments or embeds. |
| Payload conflict, 20:54:14 | Same key with changed text returned `idempotency_key_conflict`; original contribution/content/count unchanged. |
| Inaccessible-community write, 20:54:14 | Separate key targeting `public-funnel-preview-20260308` returned `semantic_not_found`; no matching root or receipt existed there. |
| Native disconnect, by 20:55:42 | Native logout removed test credentials; exact test Keychain item was absent. Fresh process `22897` reported `notLoggedIn` and rejected protected read with `Auth required`, then exited. |

Successful path:
`/communities/join-refresh-qa-sep23/channels/general/interaction:root:j97xym1sxb5knx6111a0wksgp18g9ptq.md`.
The synthetic marker, stable key, envelope hash, returned ref and hashed canonical
rows are recorded in the JSON. The sole existing community membership metadata
record remained unchanged; ownership was preserved. The root's canonical actor
matched the founder, while public actor/authority fingerprints matched that
canonical user's public identity. The user's configuration hash stayed unchanged.

## Verification and limits

- **59 focused tests across three files passed:** canonical executor (51),
  operation receipts and interaction-channel behavior (8 combined).
- MCP surface, authentication and profile contract proofs passed.
- JSON invariants, receipt links, credential exclusion and whitespace checks
  passed. The runtime's prior exact-candidate gate is linked in the evidence;
  receipt-head remote checks are separate and owned by the attached PR.
- Step 2 excluded the broad smoke runner, credential copying, new SDK/UI/auth
  infrastructure, resource changesets and unrelated write branches. Step 3
  retained the two necessary idempotency owners and proved the narrow path.

The response loss is at the proof application's adoption boundary after native
completion. No TCP interruption or live backend crash was injected. The initial
scratch-helper failure and correction remain recorded; they are not a Polynet
runtime fix or an end-to-end latency guarantee. No `operation_in_progress` lease
recovery was needed in this live case; server receipt-interruption recovery has
separate local tests.

The operation receipt principal is `external_mcp`; persisted content is the
founder's `personal_agent`, with `on_behalf_of` lineage. This does not certify
human-only contribution workflows, progress completion, accepted intelligence,
resource publication, a complete custom founder app or another native client.
Owner authority was retained; inaccessible-community denial does not certify
positive-then-revoked founder writes. Local disconnect does not certify upstream
grant revocation, provider-wide logout or rejection of issued JWTs.

Chrome blocked rendering the final loopback callback page after native completion,
as in 2B2. Native success and authenticated reads independently corroborated
enrollment. No callback replay or browser-warning bypass was used. Its screenshot
is local and ignored; only its hash is committed.

One labeled synthetic contribution and its normal evidence/operation receipts
remain staging audit history. Private temporary metadata snapshots were removed
after capture. No membership, ownership, billing or provider configuration changes
were performed. Existing staging background workers were not certified inactive.
