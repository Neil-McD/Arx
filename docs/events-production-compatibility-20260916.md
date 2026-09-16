# Events production compatibility — September 16, 2026

Scope: local backend Events compatibility and executable cached-client checks. No production deployment, migration, attachment adapter, or frontend redesign.

Production web was verified as `496e06f42b6b4117b56c544fff75fc52e70c4716`. Its Events controller requests overlap=true, limit=500; its gateway also sends authSubject, communityId, startIso, endIso and includeCancelled=false.

Restored the production Events handler, optional overlap argument, carryover index, shared display-duration policy, and production behavior tests. The test fixture replays that request shape against the candidate handler. Existing callers omitting overlap retain their behavior. Tests cover half-open boundaries, unknown end times, recurring carryover, DST, deduplication, authorization and explicit overflow errors. No frontend Events behavior was changed.

The old static compatibility proof claimed support based on endpoint-name lists. The replacement imports actual local registered functions and compares their types/public visibility and argument validators with a fresh production metadata snapshot. It allows optional additions and union expansion but rejects removal, narrowing and new required fields. Snapshotting no longer labels missing endpoints as implemented tombstones. It reads production metadata/assets only and rejects a web build change during collection.

The snapshot covers 149 literal operations found in the production bundle plus the generated composer reference verified in production shared/cloudCommunityInteractionsGateway.ts. This is not proof of every generated call site, handler semantics, scheduled jobs or live browser behavior. The live preflight still verifies the production build has not moved before comparing staging.

Validation:
- 12 tests passed across Events window, shared lifecycle and validator compatibility suites.
- Convex TypeScript check passed.
- Events bounded-read and recurrence proofs passed.
- Updated compatibility proof exits nonzero with exactly two attachment blockers: missing communityChat:generateCommunityChatAttachmentUploadUrl; narrowed communityInteractions:createCommunityInteractionComposerMessage attachment args.
- Events UI source proof also fails on its existing CSS section-boundary assertion. Its script and CSS inputs are unchanged by this slice; this is not a rendered UI finding.
- Full release gate is not claimed green: the improved compatibility proof deliberately blocks it until attachments are resolved.

Next: establish secure cached-client attachment handling; then prepare channel-name migration preflight and transitional write behavior. Keep the production release on hold. Changes in this slice are local only.
