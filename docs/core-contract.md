# Polynet core contract

**Polynet owns the canonical community world and the rules for acting within
it. Founders compose their own experiences on top (their sites, their agent's
programs) without rebuilding or overriding those guarantees.**

Status: active, October 27, 2026. Replaces `invariant-core.md` and
`irreducible-core-contract.md`. Code shows what happens today; this contract
says what must happen. A disagreement is a bug to triage, not a reason to weaken
the contract. Where each part lives: [system-map.md](system-map.md).

## Three layers

| Layer | What belongs there | Changes how |
| --- | --- | --- |
| **Invariant core** | Object identity, relationships, authority, privacy, valid state transitions, evidence lineage, retry guarantees | Rarely, by contract change |
| **Configurable product rules** | Pricing and fees, admission policies, the agent's programs, available capabilities, deployment choices | Versioned policy |
| **Founder experience** | Their site's screens, navigation, branding and copy; their agent's journey and rhythm in plain words | Freely, by founders |

Hosting, the SDK, the CLI and the MCP make the core easier to consume. They sit
on this boundary and never move it.

## Core objects

| Object | Belongs to | Canonical tables |
| --- | --- | --- |
| User | none; one identity everywhere | `users`, `userProfileDetails`, `authSessions` |
| Community | its owner | `communities` |
| Membership | community + user, unique pair | `communityMemberships` |
| Channel | community | `communityChannels`, `communityChannelParticipants` |
| Contribution | channel | `communityInteractionRoots` → `…Replies` (+ attachments, mentions, reactions) |
| Direct message | its participants | `dmConversations`, `dmParticipants`, `dmMessages` |
| Content | community | `communityResourceModules` → `communityResources` |
| Event | community | `communityEvents` |
| Money | community (founder plan) / membership (paid access) | `founderSubscriptions`, `communityPricePoints` → `communitySubscriptions` |
| Accepted memory | community | traces → digests → `communityIntelligenceNodes` + `communityEvidenceCitations` |
| Member knowledge | user (+ community) | `memberFacts`, `memberProfileSpines` |
| Agent conversation | member + community | `threads`, `cloudMessages`, `runtimeRuns` |
| Site | community | `communityDomains`, `communitySiteDeploys`, `communityAppSessions` |

## Invariants

1. **Explicit, validated authority scope.** Every operation declares its scope
   (a community, a conversation's participants, the user's own account,
   Discover, or operator) and is authorized for it. Community operations pass
   the community guard chain: active → funded → not blocked → entitled → role.
2. **Authority is current.** It is re-derived from stored state on every
   request. Tokens and sessions identify an actor; they never grant authority.
3. **Same domain owners, same semantics.** Studio, sites, the SDK, the CLI, the
   MCP and the agent may use different adapters, but every one reaches the same
   domain owner with the same authorization and effects. No second source of
   truth.
4. **Fail closed.** Missing, malformed or ambiguous state denies.
5. **Provider-verified money.** Webhooks decide payment and entitlement;
   redirects grant nothing.
6. **Archive wins** over payment, role and membership. Restore is
   generation-fenced.
7. **Private stays private.** DMs, a member's private conversation with the
   agent and private answers never become shared memory and never cross
   communities. Founders see outcomes, not members' private words.
8. **Memory is cited.** No accepted knowledge without an immutable source
   citation. Editing or deleting the source changes what can be reused.
9. **Durable effects are idempotent** and leave a receipt: admission, posts,
   approvals, payments, deploys, memory outcomes, agent messages.
10. **An actor never exceeds its grant.** A member's site acts as that member,
    inside that community, in the member lane. Founder administration from a
    site needs separately authorized management operations, never an ordinary
    member session. The MCP is for builders only.
11. **One agent per community.** Agent-page conversations, @mention replies,
    site conversations and proactive work are the same community agent. What
    it writes for a member is the agent's post, attributed to that member.
    Member, builder and autonomous permissions remain separate.
12. **Rules live in code.** Anything that sends, publishes, spends or changes
    durable facts is checked by deterministic code at the moment it happens,
    never only by a prompt.

## Canonical surfaces (must keep)

These must not be deleted in reduction passes. Changing one means updating this
document in the same PR.

1. One authenticated product capability set, with operator authority kept
   separate from customer pricing.
2. Canonical community interaction substrate + canonical community UX.
3. The community agent harness under explicit, server-validated community
   context.
4. Community cognition: compiler, accepted memory and member knowledge.
5. Official Polynet MCP and the canonical semantic operation seam.
6. Community sites: the edge, sign-in with Polynet, the SDK, the shell and
   deploys.
7. Voice UX: web voice capture and the `voice_transcribe` endpoint.
8. Community money rails: founder funding, paid-member checkout, Stripe Connect
   Express onboarding, the webhook chain and payouts.

### Studio community surface

- Channel-based Chat.
- Resources.
- Events.
- Member context in the community right rail; there is no standalone Members
  tab or page in Studio.
- The member's private conversation under the selected community context uses
  the desktop Agent page and mobile Agent root. The floating launcher is retired;
  `member_agent_dock` component and receipt names remain compatibility vocabulary.
- Builder-only Settings and Analytics.

Core agent paths: member conversations run under explicit, server-validated
community context, and member interactions and autonomous community-agent authority remain separate.

## Current product rules (configurable, not invariant)

- One founder plan: $79 per managed community, including a $20 model allowance.
  **Direction (Oct 27, pending its spec):** the community is free and the agent
  is paid, about $49 a month with an included budget.
- A 2.9% application fee on paid-member revenue, versioned in commerce policy.
- Entry policies: open, approval, paid.
- One site per community on `<slug>.polynet.page`; Studio stays Polynet's own UI.
- Proactive agent: founders see outcomes, at most two agent-started messages
  per member per week, outreach in draft mode until the founder widens it
  ([spec](specs/proactive-community-agent-v0.md)).

## Retirement candidates: dependency and data proof required

None of these is deletion-ready until its writers, compatibility obligations
and data are proven gone, following the two-release pattern in
[alpha-release-workflow.md](alpha-release-workflow.md).

| Candidate | Known state |
| --- | --- |
| Member workflows and forms | Being replaced by the proactive agent; check production use first |
| Personal-agent tables (`personalMemoryItems`, `userMemorySettings`) | Code removed Oct 27; data deletion with Neil's OK |
| Own-account payment tables (`userProviderConnections`, `userProviderAuthStates`, `userProviderDeviceAuthStates`) | Code removed Oct 27 (POL-10); encrypted keys, deleted with Neil's sign-off |
| Credit and workspace-compute tables, `legacyProgramGrants` | Neil decided Oct 27: delete after a production backup, with his sign-off |
| AI feed tables | Feature retired; retirement module still present |
| `communityArchiveDocuments`, `communityOnboardingSessions` | No writers found |
| Legacy chat (`communityChatThreads`, `communityChatMessages`, `communityMessageReactions`, `communityFeaturedMessages`, `communityInteractionLegacyChatLinks`) | Code deleted Oct 28 (POL-26); 92 of 92 production messages already in the new chat. Drop with Neil's OK |
| `communityFunnels` and the funnel editor | Code deleted Oct 28 (POL-23); a plain join page stays. The table has no live reader (6 unpublished drafts, 4 unused intro-video links): drop with Neil's OK |
| Integrations and skills tables | Code deleted Oct 28 (POL-21, POL-22, incl. GitHub and Google Drive import); tables dropped next release with Neil's OK |

## Open risks

- **Unbounded history:** diagnostics and run events grow without retention.
- **Hot spots:** `communityResources.ts`, `communityIntelligenceDirectory.ts`,
  `threads.ts`, `apps/web/src/App.tsx`. Add stable operation boundaries before
  exposing them.
- **Founder administration** from sites needs its own authorized operations
  (invariant 10).
- **Sites are staging-only** until a production edge exists.

## Deletion boundary

Safe deletions are dead code and duplicate or legacy paths outside this
contract. Any change to a listed surface must update this document and keep
`npm run check:foundation-baseline` passing.
