# Events and Resources desktop behavior

Base: production/main `47c2726f860d879cafa79aee191391cafe4d08a8`. These are bounded implementation slices, not a production release receipt.

## E1: event window authority

The existing Events query accepts optional `overlap: true` for a half-open display window `[start, end)`, no longer than 62 days. Default callers retain the existing starts-in-range semantics and response shape. Membership/entitlement checks are unchanged.

An additive community/status/end-time index finds one-off carry-over events. Indexed start-time reads include the previous hour for events without an end. Existing indexed recurring-series reads and timezone recurrence expansion are reused, extending each series' candidate occurrence window by its own duration. IDs and series authority remain unchanged. The shared one-hour fallback is display policy only; stored absent end times remain null. Candidate or occurrence overflow fails explicitly rather than returning an apparently complete partial month. Reads are bounded; no unrestricted historical scan or migration is introduced.

E1 requires the schema/index and Convex query deployment before a web client sends the new option. Do not deploy the dependent frontend alone. Existing MCP callers do not opt in.

## E2: event presentation and rollover

The mounted Events surface owns one boundary-driven clock, refreshed on visibility, focus and page resume. Stored event timestamps remain canonical. Upcoming, ongoing, started-without-end and past are derived; there are no time-driven cloud writes. Ongoing occurrences lead the current-month list, including carry-over events. Past occurrences are retained behind a disclosure, without Join or calendar-add actions. Explicitly browsing a previous month opens its history. Manual month browsing stops automatic following; Today resumes it. No automatic scroll is issued.

Rollover pauses while an event editor is open or focus is inside an event row, so a focused action is not removed underneath the user. It catches up when editing/focus leaves. The clock and listeners are cleaned up on unmount. Existing manager series-edit/cancel semantics and read ownership guards are preserved.

Verification: overlap backend tests include half-open edges, unknown ends, recurrence carry-over/IDs, DST, authorization and result overflow. Pure lifecycle tests cover classification and next wake boundaries. The real React/browser fixture covers resume-driven rollover, hidden/reachable history, expired action removal and manual-month preservation. Production acceptance remains a separate gate.

## R1: Resources read and refresh ownership

The existing Resources controller owns one refresh entry point. It verifies the session once, starts course and resource reads in parallel, and tracks pending/ready/error independently for each collection. Request generations are allocated before session resolution; obsolete responses cannot commit across account/community changes or newer read intents. The web data owner clears scoped data synchronously on identity changes and rejects writes from obsolete scope setters, including leave-and-return transitions.

A failed read is not an empty collection. Same-scope refresh failures preserve previously loaded rows, the selected course and editor drafts. Each failed collection has its own Retry; a targeted Retry does not refetch the healthy collection. Lesson counts remain unknown until resources are loaded. Selection is invalidated only after both collections have successfully refreshed. Existing manager permissions and backend mutation authorization remain unchanged.

Mutation notifications, course publish and course deletion refresh each collection once. Reordering or moving lessons refreshes resources only. Read failures settle in read state and do not throw into confirmed-write rollback paths; actual mutation failures retain their existing rollback behavior. Duplicate loading/completion flags were removed in favor of the canonical read state.

The existing 200-row UI limit is now explicit: requesting 201 rows detects overflow and reports it rather than presenting truncated counts as complete. This is not pagination or a database scalability fix; existing Resources backend collection queries still need a separate bounded-pagination design if communities grow beyond this limit.

Browser verification mounts the actual web owner and Resources panel with deferred gateway responses: parallel partial reads, targeted Retry, draft preservation, account changes, session failures, request ordering, successful publish with failed refresh, failed publish rollback, and overflow. Rendered fixture screenshots cover partial failure and Events ongoing/history states. This evidence is local and does not certify signed-in production behavior.
