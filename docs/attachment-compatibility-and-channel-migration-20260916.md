# Attachment compatibility and channel migration preparation

## Scope and deployment boundary

Local work on the forms/workflows candidate, based on a7a26dfe827e2b868bd65babf2f66895ae0e0ab2. No production or staging deployment, migration, provider execution, or production row inspection. Integration admission remains unchanged.

## Cached attachment client

Production build 496e06f42b6b4117b56c544fff75fc52e70c4716 requests an upload URL using communityId and authSubject, POSTs bytes without an auth header, receives storageId, then sends storageId plus display metadata to the composer.

The restored endpoint issues an expiring single-use HTTP capability after authentication, community access and profile checks. It reserves an owner/community receipt, caps pending reservations at 16 and schedules cleanup. The old client receives no raw storage upload URL. The HTTP handler atomically consumes the ticket, streams bounded/sniffed bytes to storage and records server metadata. Access is checked again when storage completes.

On send, only a legacy upload with a matching server-recorded owner and community is adapted. The destination channel/root is authorized and bound transactionally to the message key; canonical claim, deduplication and idempotency logic remains authoritative. Client MIME, size, type and external URLs are not trusted. New clients retain the stricter upload-time channel/root/message binding.

Files uploaded before this receipt exists cannot establish ownership from a bare storage ID. Those sends return an explicit reattach error. Do not call validator compatibility a seamless transition for those drafts: actual cached-browser error display and draft preservation remain a rendered acceptance gate. No automatic draft clearing or schema rollback is introduced.

Legacy ticket URLs are bearer capabilities. Do not log or share query strings. The adapter is temporary; remove only after old-client traffic and outstanding ticket lifetime have been accounted for in a separately reviewed retirement.

## Channel migration map

Candidate tools prepared:
- communityChannels:inspectChannelNamesInternal: read-only, at most 100 records per page, reports normalization readiness without writing names.
- scripts/channelNameMigrationPreflight.ts: aggregates all pages, detects same-community active-name collisions across pages, invalid names, repeated rows, incomplete scans and remaining backfill counts. Summaries omit names.
- Existing communityChannels:backfillChannelNamesInternal: bounded, resumable, idempotent; collision fails the transaction. No automated renames.

Do NOT deploy the entire candidate just to install these tools. It already enforces normalized names and would temporarily break create/rename.

Prepare a separate small bridge from the freshly verified production Git SHA:
1. Add optional normalizedName and its index to communityChannels.
2. Keep production channel list/reorder and existing duplicate checks. Add normalizedName to every channel creation/rename path, including General creation/repair. A same-name rename must repair a missing normalizedName instead of returning early.
3. Bring over the inspection/backfill tools and tests, without the candidate's new enforcement or private-channel behavior.
4. Review/deploy that bridge only with production release authorization.
5. Inspect ALL pages, aggregate and stop on invalid/colliding names. Resolve collisions deliberately; never rename automatically. Run bounded backfill to isDone. Reinspect from a new cursor and require zero missing/stale normalized names. Pagination is not a global snapshot; transitional writes keep concurrent new writes normalized, and final enforcement remains fail closed.
6. Only then deploy the final validated candidate backend and web through main/GitHub.

The separate production bridge is planned here, not built or deployed by this slice. Production counts, collisions, pending jobs and migration readiness remain unknown until authorized live verification.

## Local acceptance

Attachment tests replay the old URL/POST/send protocol through registered HTTP and mutation handlers, including retry, token forgery/reuse/expiry, revoked access during upload, cross-owner/community claims, private-channel denial, reply binding, unrecorded storage rejection and pending limits. Existing canonical upload/download tests remain in place.

Migration tests cover read-only inspection, cross-page case/whitespace collisions, invalid names, partial-scan refusal, resumability, preservation of display names, idempotency and batch rollback on collision. Actual production data has not been tested.

The cached-client validator proof now accepts all 150 pinned operations; this proves argument inclusion, not equivalent behavior. Legacy channel refresh behavior, pre-receipt drafts, scheduled-job compatibility and session renewal still require their release checks.

The Events source proof's obsolete CSS boundary comment was replaced with the actual following section marker. No CSS or product rendering changed.

Full local release gate passed, including foundation tests, backend/web typechecks, web build and root/web dependency audits (zero vulnerabilities). Evidence: attachment-compatibility-release-gate.json and .log in the panel-layout-audit-20260916 artifact directory. This ran against the uncommitted working tree based on a7a26dfe8; it is not clean-SHA CI evidence or deployment approval.
