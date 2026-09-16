# Frontend loading correctness, slice 1

Original slice scope: desktop loading behavior and async correctness, based on `b0169ba49f04d38a4e4ac52379f9f066cdfdf108`. No schema migration, auth/entitlement change or layout redesign was included. The separate responsive-layout commit was excluded. These changes subsequently shipped; see [desktop closure status](desktop-frontend-closure.md) for current release evidence and remaining verification, rather than treating the historical fixture notes below as deployment status.

## Ownership and invariants

- **Billing overview:** the request captures account and generation before session resolution. Only the current request may commit data, errors, or loading completion. An overview is never presented under another account. Provider-return refresh checks cancellation again after awaiting.
- **Events:** generation starts at intent time. Account, community and visible range form the request scope; account is also part of the existing range-cache key. Unresolved empty ranges display loading, not an empty result. Subsequent rollover and expired-action behavior is specified in [Events and Resources behavior](events-resources-behavior-v1.md).
- **Profile reads/saves:** the existing admin controller owns requests and coalesces active-Profile/account-graph self reads. Reads, session preparation and save completion are scoped to the original account epoch. A save snapshots fields before the first await and rejects duplicate submission while in flight. A changed account prevents any subsequent profile write from being issued; a write already issued cannot be undone by client cancellation.
- **Profile draft:** `profileDraftState` is the pure model behind the existing Profile UI controller, not a new store/cache. Per-field edit versions and touched flags distinguish intentional empty edits from untouched fields. Only unchanged submitted fields accept a save acknowledgement. Later edits stay dirty; failed saves preserve the draft. Clean fields may accept subsequent server hydration.
- **Persistence:** the Profile UI controller is the single hydration/persistence owner. Existing account-scoped text keys remain, with versioned touched-field metadata so cleared drafts survive reopening and saved text does not indefinitely mask fresh server data. No avatar URLs or image bytes are persisted in the draft. Older text-only drafts are preserved on first read; their metadata is recorded by the normal writer. Account changes synchronously select that account's draft and reject stale field-setter callbacks.
- **Identity/media:** `UserAvatar` treats an undefined photo field as unresolved and explicit null as known absence; callers must preserve that distinction. Existing framed-media decoding/cache remains canonical. Avatars reserve dimensions and use a neutral non-animated pending surface while identity or image data resolves; confirmed missing/failed images use intentional fallbacks. Member stacks receive complete face projections and normalize absent URLs to null. Explicit profile-photo removal is not overwritten by cached projection data.
- **Profile presentation:** loading, saved, dirty, saving and failed states are explicit. Save is disabled until data is resolved and a save is needed. Profile photo-action space is reserved to prevent the fields shifting on hydration. Names remain accessible after placeholder text disappears. Shared framed media uses the lowercase HTML fetchpriority attribute for React 18, retaining the browser-image priority setting.

## Validation

### Session-failure closure

The follow-up on `caf6f8f41` fixes two current-request failure paths without changing authentication authority. After session resolution, request ownership is checked first: obsolete Events reads and Profile saves remain silent. A missing or mismatched session for a still-current request produces actionable feedback and issues no Events query, avatar preparation or profile write. Profile uses its existing unauthenticated callback and error panel, with a nonempty fallback message when the caller supplies null; the draft and retry capability are preserved. No automatic logout, resubmission or retry loop is added.

Events uses its existing error/Retry panel. A failed empty range does not show either perpetual loading or a false “No events” success; previously loaded events remain available. Once an explicit retry succeeds, the error clears and a genuinely empty result may render as empty.

The browser suite adds missing/mismatched/rejected session cases, explicit recovery, superseded request and account-switch checks. The missing/mismatched cases failed against the pre-fix candidate before the implementation. Rendered Events and Profile error states are captured as `events-session-error.png` and `profile-session-error.png`; assertions check the recovery UI, enabled Save, preserved draft, no unauthorized gateway calls and successful retry. This remains fixture verification, not a signed-in production canary.

`npm run check:loading-correctness` runs pure draft/image/registry tests and a real React browser harness with deferred gateway boundaries. All external browser requests are blocked except a locally fulfilled image fixture. No customer data or credentials are used.

The initial five browser regressions were run against the unchanged production source and all failed as expected: billing after logout, Events intent ordering, cleared Profile draft hydration, direct account switch, and unresolved-avatar initials. Reproduce with `node scripts/loading_correctness_browser_proof.mjs --baseline=b0169ba49f04d38a4e4ac52379f9f066cdfdf108` (expected nonzero exit). The candidate must pass those plus save-during-edit, account change during photo preparation, failed versus missing profile reads, stale billing errors and StrictMode effect replay.

Rendered checks cover Profile loading/ready/dirty/error states, disabled/enabled Save behavior, delayed image presentation and unchanged avatar/field geometry. Screenshots and JSON receipts are generated under `artifacts/loading-correctness/` (not committed). A passing fixture is not a claim that every signed-in production route is race-free or faster.

Related static proofs now follow the actual canonical owners: onboarding avatar editor through Account Setup Form, presence images through MemberAvatarStack, typing identities through communityTypingPresenceCore, and the current bounded Events CSS section. These were stale source-location checks, not product behavior changes.

The loading correctness check is part of the deterministic release gate. Release still requires an explicit decision and the canonical GitHub/main workflow. No direct Vercel deployment.

## Events Retry and Profile feedback closure

The follow-up based on production `d37d8db65fc028669045d52f393d949fa811d15f` removes two duplicate owners:

- The web Events Retry wrapper passes the rendered session directly into the existing Events controller. Only that controller resolves the session, captures intent order, reports failure and completes loading. No authorization checks are removed. A signed-out or community-less wrapper is inert; obsolete account, community and range requests remain unable to commit.
- Profile uses its existing derived Sync status as the sole saving/saved/unsaved announcement. The separate two-second success timer, success flag and forwarding props are removed. Error feedback, per-field edit versions, account guards and draft persistence are unchanged.

The browser fixture now mounts the real web content controller and renders Events with its actual Retry action, mocking only cloud gateways. Seven additional checks cover missing/mismatched/rejected sessions, recovery with one session resolution and one query, account/community/range changes, and superseded retries in the same range. Profile save-recovery checks also assert one accessible Saved status, Saving during the request, and immediate Unsaved changes after another edit. The new wrapper and duplicate-status assertions reproduced failures against the unchanged production source before implementation. This is local fixture evidence, not a production deployment or live account test.

## Deliberately left for later

- Events lifecycle and Resources read/refresh work shipped as separate slices; their current contract is [Events and Resources behavior](events-resources-behavior-v1.md). Release and acceptance references are in [desktop closure status](desktop-frontend-closure.md).
- Broad cold-route timing, layout-shift and interaction-latency profiling; viewport-prioritized hydration; bundle/subscription optimization based on measurements.
- Full signed-in end-to-end account switching, uploads, billing return and all other surface transitions. This slice verifies the named contracts with isolated fixtures; it does not certify the whole frontend.
