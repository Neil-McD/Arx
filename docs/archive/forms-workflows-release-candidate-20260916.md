# Forms and workflows release candidate

## Production release reconciliation, September 16

The user authorized shipping after the read-only production-impact review. The additive backend bridge at 353e2aa9821ed8d77eb4898015ae8147030a07cb deployed successfully. A complete production scan found 19 channels, no invalid names or collisions. Backfill updated all 19 without changing display names; two subsequent scans found zero missing/stale keys.

The local candidate had copied some production fixes without including main's ancestry. A normal push safely rejected it. Merge production 496e06f42 into the candidate, retaining production's native YouTube player, PDF controls, media proofs, profile/loading fixes and Events presentation. Keep the candidate's Events query test arguments because its backend validator requires them. Rerun the merged release gate before cutover; the earlier 525afc9d hosted pass alone is insufficient for this merge.

Production scheduled queue was empty before preparation. Authenticated MCP channel listing and existing chat remained healthy after the bridge. The accounting smoke passed with its supported 1,000-row limit after the default 10,000-row query timed out; provider-cost history is bounded, while the other five tables returned fewer than the limit. This does not certify all historical provider-cost records.

Local candidate based on 3ac7eebd8. No deployment or production mutation in this slice.

## Reconciled bridge

The additive schema fields, indexes, paginated inspection/backfill and preflight summarizer already match the prepared bridge. Reconciled the missing General-channel normalized-name repair and same-name stale-index repair into the candidate, retaining its access controls and mandatory migration gate for unmigrated custom rows. The bridge's permissive transitional writes stay in the separate production bridge; final enforcement must only deploy after that bridge and backfill succeed.

42 focused migration and attachment tests pass, including General repair, idempotency, unchanged display/policy, stale same-name repair and blocking unmigrated rows. No frontend or attachment implementation changed; prior live attachment evidence remains applicable within its recorded limits.

## Backend overlap review

Fresh read-only production function metadata from wry-hawk-715: 629 identified backend functions checked against candidate exports/types/argument acceptance. Three differences require release review (see production-backend-contract-audit-20260916.json):

- communityCompilerEvidence:drainSelfAuthoredPendingSourceTracesInternal is replaced by drainIneligiblePendingSourceTracesInternal. Old heartbeat actions call the former through runMutation.
- communityChannels:listCommunityChannelsInternal is absent. Old canonical executor actions call it through runQuery.
- communityInteractions:createCommunityAgentCanonicalInteractionInternal narrows attachment arguments. Old builder setup/lifecycle/executor code calls it.

These are internal rolling-deployment/in-flight-call risks, not proof that three scheduled jobs are broken. Production pending-job inventory and concrete argument payloads were not inspected. Do not restore an unrestricted channel reader or accept unowned storage IDs merely to make metadata comparisons green. Decide whether each requires a narrow compatibility handler or a verified drain/deployment boundary.

## Release gates

1. Review the three internal compatibility differences and actual pending/in-flight work.
2. Review and authorize the separate production bridge deployment; scan ALL channel-name pages, stop on invalid names/collisions, backfill, then verify zero missing/stale keys.
3. Validate the exact final candidate commit with the canonical release gate. A green code gate does not clear the operational gates above.
4. Repeat affected staging checks if later fixes change tested behavior. Live production-client small-file send and upload rejection/reattach recovery passed; response-loss replay, post-upload send failure, and session renewal remain unverified live.
5. Review deployment order and schema-compatible rollback before any main merge/production release. Optional normalized fields must remain in rollback schema after backfill; old source cannot simply replace the backend.

Production remains at 496e06f42. Staging web was restored to 00a405ab9 (same tree as a7a26dfe8); backend remains the previously deployed candidate. This local candidate is not a release authorization.
