# PolyNet.ai MVP — Alpha Hardening Checklist

Date: 2026-02-13  
Scope: `/Users/neilmcdevitt/code/arx/.worktrees/mvp`

## Goal

Prove the core MVP loop is stable for alpha:

1. Member can join and pass gate.
2. Thread community lens switch is deterministic and auditable.
3. Billing return and checkout finalize produce correct entitlement outcomes.
4. Voice start/stop/transcribe loop works on workspace + community surfaces.

## First-Principles Test Boundaries

- **Availability:** app boots to non-empty shell with no console/runtime errors.
- **Access correctness:** auth/membership/entitlement checks remain fail-closed.
- **Continuity correctness:** thread lens context changes only for subsequent turns and remains auditable.
- **Payment correctness:** finalize/redirect paths are idempotent and entitlement-driven.
- **Voice correctness:** controls stay wired, state transitions are explicit (`idle` → `recording` → `transcribing` → `idle`).

## Automated Gate (must pass)

Run:

- `bash scripts/alpha_hardening_gate.sh`

This runs:

- build root + web
- web bootstrap smoke
- public funnel/join regression checks
- join-review controller checks
- thread context/lens matrix
- billing/checkout return controller checks
- voice surface regression check
- full community core matrix

## Manual UX Pass (required before alpha sign-off)

### 1) Join / Gate Flow
- Open public community landing (`/c/:slug`) signed out.
- Verify CTA and gate messaging align with paid/free/request mode.
- Join path results:
  - unauthenticated action triggers auth intent
  - post-auth returns to intended community
  - successful join lands in community workspace

### 2) Thread Lens Switch
- In one thread, switch from community A to community B.
- Send a new turn and confirm response/evidence aligns to B only.
- Verify prior messages are unchanged and context provenance remains attributable per-turn.

### 3) Billing Return / Checkout Finalize
- Trigger paid join / builder upgrade checkout.
- Return from provider and verify:
  - finalize status resolves deterministically
  - entitlement/access updates without manual refresh hacks
  - retry path does not double-apply claims

### 4) Voice Start / Stop
- Workspace surface:
  - start recording
  - stop to transcribe
  - transcript inserts into workspace input
- Community surface:
  - same flow, respecting membership/post permissions
- Verify denial toasts/messages are correct for signed-out or non-entitled states.

## Evidence to Record per Run

- Commit SHA tested.
- Output of `bash scripts/alpha_hardening_gate.sh`.
- Short manual pass notes for each of the four UX sections above.
- Any failure with:
  - reproduction steps
  - expected vs actual
  - owning surface (web/desktop/cloud).

## Exit Criteria

Alpha hardening is complete only when:

- automated gate is green,
- all four manual UX passes are green,
- no open P0/P1 defects on join/lens/billing/voice flows.
