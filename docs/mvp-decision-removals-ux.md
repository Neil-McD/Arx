# MVP Decision Removals (UX Impact Review)

Date: 2026-02-12  
Scope: `.worktrees/mvp`

This file covers deletion candidates that are not high-confidence and require explicit product decisions.

## Decision Matrix

1. `community_join_requests` flow (`request_access`)  
Recommendation: `KEEP` for MVP.  
UX impact if removed: free/published communities lose moderated access path; users hit hard paywall or dead-end on gated entry.  
Rationale: your current MVP still includes gated communities and founder-managed access.

2. `community_funnel_configs` table/runtime  
Recommendation: `KEEP` for MVP.  
UX impact if removed: founders lose external-landing/funnel mapping control; breaks stated “bring your own landing page/funnel” requirement.  
Rationale: aligns with your decision to keep funnel configuration while dropping lead-capture surface.

3. Automation schema/runtime beyond BrandOS/webhook bridge  
Recommendation: `DELETE` broad automation runtime, `KEEP` minimal BrandOS/external webhook path only.  
UX impact if over-removed: founders cannot connect external flows.  
Rationale: preserves MVP integration while eliminating deferred workflow depth.

4. Invite expiry transition command (`mark_pending_invite_expired_cmd`)  
Recommendation: `ADD` command parity or remove expiry from docs/contracts.  
UX impact if left unresolved: stale “pending” invites and confusing moderation state.  
Rationale: this is contract clarity and operator reliability, not feature expansion.

5. Desktop exec-policy rules surface (`get_exec_policy_rules_cmd` / `set_exec_policy_rules_cmd`)  
Recommendation: `KEEP` for now; reconsider after launch telemetry.  
UX impact if removed now: advanced desktop safety control disappears for power users; low impact to core member journey.  
Rationale: not primary MVP path, but it is active and not a no-op.

6. Release snapshot docs under `docs/release/*`  
Recommendation: `ARCHIVE`, not hard delete.  
UX impact if removed: none for end users; potential loss of operator/debug history.  
Rationale: keep an audit trail while reducing top-level noise.

## Cut Line for Next Deletion Wave

- Proceed now: broad automation runtime deletion (except BrandOS/webhook minimal bridge), archive legacy release docs.
- Defer for explicit decision: join-request removal, funnel-config removal, exec-policy command removal.
- Contract cleanup required regardless of deletion: invite-expiry parity.
