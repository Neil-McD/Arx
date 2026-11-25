# Agent Pricing & Optional Usage Boosts (v1 Spec)

Status: approved by Neil on 2026-11-24. Supersedes the Oct 27 tentative "$49/mo"
pricing note; keeps the live `$0 Free + $79/mo Agent Workspace` pricing anchor
and defines optional prepaid community usage boosts for high-volume communities.

## 1) Product & Market Positioning

- **Free Workspace ($0/month):** Full community (channels, courses, pods, events,
  custom community site, official Polynet MCP, paid member commerce with a 2.9%
  Polynet application fee, and zero-AI weekly digests). No Polynet-hosted AI agent.
  Unfunded communities remain bounded at 10 live per owner.
- **Agent Workspace ($79/month per community, month-to-month):** Unlocks the
  community's always-on Persistent Agent (shared Identity, living Community/Member/Builder
  Soul & Memory, private 1:1 chats, public @mentions & active thread follow-ups,
  Daily Founder Brief, activity-tapered Member & Builder Heartbeats, and cited
  unanswered-question replies) with a **$20.00/month included AI allowance**
  aligned to each Stripe billing cycle, plus the same 2.9% commerce fee.

## 2) Optional Prepaid Community Usage Boosts (Past $20/Month)

To let fast-growing communities scale smoothly past $20/month without post-paid
bad-debt risk or modifying existing $79 Stripe subscriptions:

- **Default posture:** **Off (pause at $20.00/month).** No founder is ever
  charged past $79/month unless they explicitly opt in and pay.
- **Boost unit:** **$30.00 paid on Stripe** grants **+$20.00 (`20_000_000` micros)**
  of additional AI allowance to the community's **current active billing cycle**
  (1.5× cost pass-through, ~33% gross margin on extra usage).
- **Mandatory monthly safety cap:** Founders who opt in pick a hard per-cycle
  ceiling from fixed presets:
  - `$0` — Paused at $20 included (default)
  - `$30/cycle` (up to 1 boost → $40 total AI allowance)
  - `$60/cycle` (up to 2 boosts → $60 total AI allowance)
  - `$150/cycle` (up to 5 boosts → $120 total AI allowance)
  - `$300/cycle` (up to 10 boosts → $220 total AI allowance)
- **First-cycle anti-abuse ceiling:** Brand-new subscriptions in their very first
  billing cycle are hard-capped at **$60/cycle (2 boosts max)** regardless of a
  higher selected preset until their first monthly renewal invoice settles cleanly.
- **Cycle expiration:** Paid boosts apply strictly to the active billing cycle in
  which they are granted and expire cleanly at cycle reset (simple cycle ledger,
  zero indefinite deferred-liability carry-over).
- **Guardrails & alerts:**
  - Effective cycle allowance is `includedCostMicros + paidBoostCostMicros`.
  - The 90% live-chat reserve pauses non-urgent background AI (member heartbeats,
    builder heartbeats, and reply drafts) at 90% of the **effective** cycle allowance.
  - 80% and 100% founder alerts evaluate against the effective cycle allowance.
- **Payment-health fail-closed invariant:** Any `past_due`, `unpaid`, `canceled`,
  refunded, or risk-revoked subscription immediately refuses boost purchases and
  halts usage. Stripe webhooks are the sole authority that grants `paidBoostCostMicros`;
  redirects are UX only.

## 3) Rollout Plan (Protected Lane)

- **Step 1 (Spec + Ledger + Safety Cap Settings — this slice):**
  - Lock this spec and shared contract (`shared/founderUsageBoosts.ts`).
  - Add additive `paidBoostCostMicros` and `paidBoostCount` fields on
    `founderUsageCycles`, and `usageBoostCapCents` on `communityMemberCoachSettings`.
  - Update `founderPlanCore.ts` ledger reservation/settlement assertions and
    allowance guardrails/Settings projection to honor `included + paidBoost`
    and display the founder's monthly safety cap cleanly (no Stripe charges yet).
- **Step 2 (Stripe Checkout / Settlement & Webhook Granting — next slice):**
  - Add idempotent `founderUsageBoostReceipts` table, Stripe one-time checkout
    for a $30 boost tied strictly to `(communityId, founderSubscriptionId, cycleKey)`,
    webhook verification granting `paidBoostCostMicros`, and refund revocation.
