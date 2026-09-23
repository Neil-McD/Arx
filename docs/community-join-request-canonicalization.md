# Community join-request canonicalization

## Canonical model

`communityJoinRequests` is transient admission state, not an event log.

- No row: the user has no current approval decision.
- `pending`: the user is waiting for a manager decision.
- `denied`: the user may reapply at `reapplyAt`.
- Active membership: no join-request row may exist.

Leaving, removal, and banning are membership lifecycle state. They must not be
encoded as special join-request messages. Approval, cancellation, checkout,
and activation consume the transient request row rather than retaining a
terminal-history row.

## Release order

Production still contains bounded legacy terminal history and a few duplicate
pairs. The online cutover therefore stops new drift before repairing old data.

### Release A: compatibility cutover

1. Deploy canonical writers and the pair-scoped compatibility reader.
2. Keep each pair read bounded. Known `denied -> pending` reapplication history
   may resolve to the later pending row; every other multi-current shape fails
   closed as `community_join_request_state_ambiguous`.
3. Owner admission is a no-op, blocked applicants cannot be approved, and
   membership activation requires a unique membership pair.
4. Normal writes collapse deterministically understood legacy rows for that
   pair. There is no table-wide migration in this release.
5. Keep the broad schema and cached-client compatibility operation until the
   production repair is complete.

### Release B: bounded reconciliation

1. Add a read-only census and a versioned, expectation-locked reconciliation
   mutation in a separate slice.
2. Process small deterministic batches and write a durable
   `criticalAuditEvents` receipt for every attempted batch.
3. Stop on unknown rows, changed expectations, duplicate memberships, owner
   dependencies, or any ambiguous pair. Never guess.
4. Re-run the census and require zero contradictions before strict enforcement.

### Release C: strict enforcement

1. Replace the compatibility reader with a strict unique-pair reader.
2. Replace `status: v.string()` with the `pending | denied` union and delete the
   optional `message` field.
3. Remove reconciliation code after its production receipt and postcondition
   are verified.
4. Add realtime request-list delivery only after the authority model is strict.

The cached `community:getMyJoinRequestBySlug` compatibility operation remains
temporarily callable for pinned older clients. Current web code does not use
it; remove it only when the cached-client compatibility contract advances.

## Public funnel display freshness

While an authenticated visitor's request is pending, the open funnel checks
their server-verified access every 30 seconds and when the tab becomes visible
or focused. It refreshes only the access projection, leaving the funnel and
images mounted. An approved request changes the CTA to enter the community;
a denied request shows the server's decision. Failed checks retain the last
verified display and retry. Responses are ignored after a route or account
change, or after the visitor cancels the request. The server remains the sole
admission authority; the polling result never grants access by itself.

### Staging acceptance, September 23, 2026

Web build `f146f648178ce70eafe0de56c8210d77438125a3` served the isolated
`join-refresh-qa-sep23` community (`jx776byemb14q9wt1yjm9nb46d8ezt7g`).
The separate `test1` account requested access and left the funnel open at
**Request pending**. The owner approved the request from the members panel.
Within the next 35 seconds, the same member tab and URL showed **Enter
community** without a reload; the button opened the member chat. A read-only
database check found one active test membership and zero remaining requests.
The visual pass did not measure network-call volume or exercise denial,
cancellation, and account-switch races in a hosted browser.
