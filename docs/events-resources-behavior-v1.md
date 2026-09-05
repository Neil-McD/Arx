# Events and Resources desktop behavior

Base: production/main `47c2726f860d879cafa79aee191391cafe4d08a8`. These are bounded implementation slices, not a production release receipt.

## E1: event window authority

The existing Events query accepts optional `overlap: true` for a half-open display window `[start, end)`, no longer than 62 days. Default callers retain the existing starts-in-range semantics and response shape. Membership/entitlement checks are unchanged.

An additive community/status/end-time index finds one-off carry-over events. Indexed start-time reads include the previous hour for events without an end. Existing indexed recurring-series reads and timezone recurrence expansion are reused, extending each series' candidate occurrence window by its own duration. IDs and series authority remain unchanged. The shared one-hour fallback is display policy only; stored absent end times remain null. Candidate or occurrence overflow fails explicitly rather than returning an apparently complete partial month. Reads are bounded; no unrestricted historical scan or migration is introduced.

E1 requires the schema/index and Convex query deployment before a web client sends the new option. Do not deploy the dependent frontend alone. Existing MCP callers do not opt in.
