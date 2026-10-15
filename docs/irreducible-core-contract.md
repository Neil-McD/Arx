# Irreducible Core Contract (MVP)

Status: active  
Scope: deletion boundary + production hardening baseline

## Canonical Surface Keep-List

These surfaces are non-negotiable for MVP and must not be deleted during reduction passes:

1. One authenticated product capability set, with operator authority kept separate from customer pricing.
2. Canonical community interaction substrate + canonical community UX.
3. Member personal-agent harness under explicit community context.
4. Separate community-owned agent, cognition, AI feed, and community research.
5. Official Polynet MCP and canonical semantic operation seam.
6. Hosted community inference through the $79 Builder plan or canonical operator grant.
7. Voice UX.
8. Community monetization rails (including Stripe Connect Express onboarding).

## Community Surface (Must Keep)

Canonical community surfaces:

- Channel-based Chat.
- Resources.
- Events.
- Member context in the community right rail; there is no standalone Members
  tab or page.
- The member's private conversation under the selected community context uses
  the desktop Agent page and mobile Agent root. The floating launcher is retired;
  `member_agent_dock` component/receipt names remain compatibility vocabulary.
- Builder-only Settings, canonical funnel management, and Analytics.

Core AI-agent paths:

- Member conversation harness under explicit, server-validated community
  context. See `community-agent-conversations.md` for the current presentation;
  member interactions and autonomous community-agent authority remain separate.
- Separate community-owned Concierge and Steward execution.
- Active community system prompt.
- Draft list/upsert/activate RPC paths.

## Inference and Auth (Must Keep)

- Platform-hosted inference for communities with active Builder or canonical operator authority.
- Historical founder credentials grant no community-inference authority.
- Community-scoped agent tooling remains available to authenticated users with
  sufficient entitlement and quota.
- Public and private edge routing contracts remain explicit.

## Monetization Rails (Must Keep)

- $79/month founder funding per managed community, including the $20/month raw Luna allowance.
- Unlimited paid community ownership: no account-level numeric cap, one funding
  source per community, and no stacked unfunded drafts.
- Public funnel -> paid member checkout start -> checkout finalize -> webhook chain.
- Universal 2.9% Polynet application fee on paid-member community revenue.
- Connect onboard start (Stripe Connect account onboarding).
- Webhook idempotency + entitlement reconciliation path.

## Voice UX (Must Keep)

- Web voice capture + transcription path.
- `voice_transcribe` edge endpoint deployment.

## Deletion Boundary Rule

Safe deletions are limited to dead code and duplicate/legacy paths outside this contract.  
Any change to a listed surface must:

1. Update this document.
2. Keep `npm run check:foundation-baseline` passing.
