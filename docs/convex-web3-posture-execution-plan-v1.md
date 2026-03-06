# Convex + Web3 Posture Execution Plan v1

Status: parked (future-facing)
Worktree: `/Users/neilmcdevitt/code/arx/.worktrees/daytona`
Intent: complete Convex migration and hardening first, while preserving a clean path to wallet-linked identity and tokenized community rails later without rewriting core product logic.

## 1) First-Principles Model

The platform should treat these as separate systems:

1. Truth system (canonical): Arx local event truth and projections.
2. Identity system: user identity graph (OAuth now, wallet-linked identities later).
3. Entitlement system: access decisions from normalized proofs (Stripe/manual now, on-chain proofs later).
4. Economics system: community pricing, stake, governance, treasury.
5. Settlement system: external rails (fiat providers and future chains).

Rule:
- Money affects access, not truth.
- Identity providers are adapters, not canonical user truth.
- Chain selection is a settlement concern, not a product model concern.

## 2) Current Posture (Evidence Snapshot)

As of this plan:

1. Active runtime/product Supabase transport markers are removed from the Convex migration surface.
2. Convex backend surface is now canonical for runtime/product paths.
3. Identity is modeled as authenticated subject (`authSubject`) and user rows.
4. Entitlements are source-based (`default`, `stripe`, `admin_override`, `manual_grant`).
5. Web3/wallet/tokenization concepts are not implemented in active runtime/product contracts yet.

Interpretation:
- Direction is correct for optionality.
- Feature-level Web3 rails are intentionally not yet built.

## 3) Strategy From Here (Best Path)

Run two tracks in order:

1. Track A: Convex completion + correctness (must complete first).
2. Track B: Web3 posture contracts and inert seams (no user-visible feature activation).

Do not activate chain logic until Track A is stable.

## 4) Track A — Convex Completion (Execution-Blocking)

Execution board:
1. `docs/archive/convex-track-a-execution-board-v1.md`

### A1. Runtime contract completion

Scope:
1. Align `/runtime/runtime_turn` behavior with `canonical-cloud-run-v1` target semantics.
2. Harden deterministic event/run/tool lifecycle behavior for cloud tool-capable turns.
3. Remove or strictly bound implicit fallback behavior for `requires_tools=true` turns.

Acceptance:
1. Cloud tool turns emit canonical lifecycle semantics per active contract docs.
2. Duplicate replay/idempotency behavior is deterministic across web and desktop cloud surfaces.
3. No silent lane drift for tool-capable cloud turns.

### A2. Gate and auth hardening

Scope:
1. Keep gate authority server-side.
2. Keep identity verification fail-closed by default.
3. Preserve tier and community entitlement contract behavior during migration hardening.

Acceptance:
1. Foundation and journey smoke gates remain green.
2. Verified identity guard remains green.
3. Gate parity matrix remains behaviorally consistent.

### A3. Convex migration closure

Scope:
1. Finish migration-era cleanup only after parity confidence is high.
2. Keep docs and guard scripts synchronized with real runtime behavior.

Acceptance:
1. Migration reports and baseline gates pass in CI.
2. Runtime/product code paths remain legacy transport free.

## 5) Track B — Web3 Posture (No Activation)

### B1. Identity-link contract (spec only)

Deliverable:
1. Add a contract doc defining linked identities as a separate model from canonical user.

Required fields (contract):
1. `identity_kind` (`oauth`, `email`, `wallet`).
2. `identity_value` (normalized identifier).
3. `verified_at` and verifier metadata.
4. `status` (`active`, `revoked`, `superseded`).
5. One-to-many link from user to identities.

Acceptance:
1. Existing OAuth flow semantics unchanged.
2. No gate behavior changes.

### B2. Entitlement-proof contract (spec only)

Deliverable:
1. Define normalized entitlement proof contract consumed by gates.

Required fields (contract):
1. `proof_source` (`stripe`, `manual`, `onchain_token`, `onchain_nft`, `onchain_membership`).
2. `subject_ref` (user identity reference, chain-agnostic format).
3. `scope_ref` (global/community/project).
4. `grant_type` and validity window.
5. `evidence_ref` (opaque, auditable pointer).

Acceptance:
1. Gate engine consumes normalized effective entitlement only.
2. No direct provider coupling in gate decisions.

### B3. Community economics contract (spec only)

Deliverable:
1. Define policy-layer contract for community economics without launching tokens.

Required fields (contract):
1. Membership class and rights profile.
2. Governance role policy.
3. Treasury policy metadata.
4. Distribution/vesting policy metadata.

Acceptance:
1. Contract is additive and does not alter current community UX/gates.

### B4. Chain adapter boundary (spec only)

Deliverable:
1. Define chain adapter interface and chain-agnostic identity format requirements.

Adapter responsibilities:
1. Verify ownership proof.
2. Resolve on-chain evidence.
3. Return normalized proof payloads.

Acceptance:
1. Core app logic references adapter interface only.
2. No chain-specific branching in gate/UI core logic.

## 6) Deferred Until Explicit Product Trigger

Do not implement before trigger criteria are met:

1. Wallet connect UI and signing UX.
2. Smart contract deployment and operational tooling.
3. On-chain membership/token enforcement in production gates.
4. Tokenized community UX and governance execution flows.

## 7) Trigger Criteria To Start Web3 Activation

All must be true:

1. Convex runtime contract hardening milestones are complete.
2. Auth and gate reliability SLO is stable for at least one release window.
3. Legal/compliance posture for tokenized community features is approved.
4. Economic policy contract for communities is reviewed and frozen.

## 8) Risks and Blind Spots

1. Over-coupling identity to one provider blocks wallet onboarding.
2. Mixing settlement logic into gate logic causes expensive rewrites later.
3. Launching token mechanics before policy invariants invites irreversible errors.
4. Conflating financial state with canonical truth corrupts continuity/audit guarantees.

## 9) Execution Cadence

Recommended weekly cadence:

1. Week N: close highest-risk Convex runtime/gate parity gaps.
2. Week N+1: author and review Web3 posture contracts (identity, entitlement-proof, economics, adapter).
3. Week N+2: add inert schema seams only if needed for contract validation.
4. Reassess activation trigger criteria after each release window.

## 10) Definition of Done (This Plan)

This plan is complete when:

1. Track A milestones are executed and validated.
2. Track B contract docs exist and are approved.
3. No Web3 runtime activation has occurred prematurely.
4. The platform remains Convex-first and Web3-ready by design.
