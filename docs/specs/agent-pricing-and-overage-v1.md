# Agent Pricing, Tiers & Optional Usage Boosts (v2 Spec)

Status: approved by Neil on 2026-11-24. Establishes Polynet's three-tier
pricing ladder (`$0 Free · $20 Guide · $100 Chief of Staff`, no free trial)
plus optional prepaid community usage boosts on Chief of Staff, while cleanly
grandfathering legacy `$79/month` subscriptions as `chief_of_staff`.

## 1) Product & Market Positioning (3 Tiers, No Free Trial)

- **Free ($0/month):** *Build your community.* Full community (channels,
  courses, pods, events, DMs, custom links, Discover, official Polynet MCP,
  paid member commerce with a 2.9% Polynet application fee, and zero-AI weekly
  digests). Unlimited members. No Polynet-hosted AI agent. Unfunded communities
  remain bounded at 10 live per owner.
- **Guide ($20/month per community, month-to-month):** *The community that
  remembers.* Everything in Free, plus the reactive AI Guide: private 1:1 chats,
  public @mentions, smart thread follow-ups, living Community & Personal Soul
  and Memory, and nightly community learning, with **$3.00/month included AI
  allowance** (`3_000_000` micros; single-run reservation cap `$0.50` /
  `500_000` micros).
- **Chief of Staff ($100/month per community, month-to-month):** *The agent
  that helps run your community.* Everything in Guide, plus the full proactive
  Chief of Staff suite — Daily Founder Briefs, activity-tapered Member
  Check-Ins & win-backs (+ 24h email nudges), Builder's Own Proactive
  Check-Ins, unanswered-question auto-replies & drafts, and optional prepaid
  usage boosts — with **$20.00/month included AI allowance** (`20_000_000`
  micros), plus the same 2.9% commerce fee.
- **Member vs. Founder Naming:** Members continue to experience their personal
  community companion as **Guide**; founders upgrade to **Chief of Staff** for
  the proactive community-running agent.
- **Grandfathering & Operator Grant:** Existing legacy `$79/month` founder
  subscriptions (`POLYNET_FOUNDER_STRIPE_PRICE_ID`) and operator-comped
  communities resolve automatically to `chief_of_staff` (`$20.00/month`
  allowance + full proactive suite) with zero disruption.

## 2) Optional Prepaid Community Usage Boosts (Chief of Staff Only)

To let fast-growing Chief of Staff communities scale smoothly past $20/month
without post-paid bad-debt risk or modifying active subscriptions (Guide
communities upgrade to Chief of Staff first for nearly 7× the allowance plus
the full proactive suite):

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

- **Boost Foundation (Steps 1–2, shipped in PRs #821–#822):**
  - Shared boost ledger (`paidBoostCostMicros`, `paidBoostCount`, `usageBoostCapCents`),
    idempotent `founderUsageBoostReceipts`, Stripe one-time Checkout (`mode: "payment"`),
    webhook-authoritative granting, refund/dispute clawback, and return confirmation.
- **3-Tier Rollout — Step 1 (Tier Contract, Allowance Sizing & Proactive Gating):**
  - Lock `FounderPlanTier = "guide" | "chief_of_staff"` in `shared/founderPlan.ts`
    (`guide`: $20/mo, $3 AI, $0.50 max run reservation; `chief_of_staff`: $100/mo,
    $20 AI, full proactive suite + boosts; legacy $79 and operator grants map to
    `chief_of_staff`).
  - Add additive `planTier` on `founderSubscriptions` and `founderBillingCheckouts`,
    support tier-aware cycle allowances (including safe mid-cycle upgrades/downgrades),
    and gate the 4 proactive engines + boost purchases to `chief_of_staff`.
- **3-Tier Rollout — Step 2 (Two-Tier Stripe Checkout & Mid-Cycle Upgrade/Downgrade Sync — Protected Lane):**
  - Configure `POLYNET_FOUNDER_GUIDE_STRIPE_PRICE_ID` ($20/mo) and
    `POLYNET_FOUNDER_CHIEF_OF_STAFF_STRIPE_PRICE_ID` ($100/mo), enable selecting
    either tier at checkout, and sync mid-cycle upgrades/downgrades via Stripe webhooks.
- **3-Tier Rollout — Step 3 (Plan Picker, Settings Upgrade Prompts & Homepage Refresh — Fast Lane):**
  - Show Free / Guide ($20) / Chief of Staff ($100) across checkout, Settings,
    tier-aware 80%/100% alerts, and the public homepage.
