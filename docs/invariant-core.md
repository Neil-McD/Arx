# Polynet invariant core

**Polynet owns the canonical community world and the rules for acting within
it. Founders compose their own experiences through supported capabilities,
without rebuilding or overriding those guarantees.**

Status: **draft contract**, October 16, 2026, from `main` at `6b7c269ec` and a
read-only staging snapshot. Code shows what happens today; this contract says
what should happen. A disagreement is a bug to triage, not a reason to weaken
the contract.

## Three layers

| Layer | What belongs there | Changes how |
| --- | --- | --- |
| **Invariant core** | Object identity, relationships, authority, privacy, valid state transitions, evidence lineage, retry guarantees | Rarely, by contract change |
| **Configurable product rules** | Pricing and fees, admission policies, workflow structure, available capabilities, front-end and deployment choices | Versioned policy |
| **Founder experience** | Screens, navigation, branding, programs, personas, application logic | Freely, by founders |

Hosting, templates, the SDK and the CLI make the core easier to consume. They
sit on this boundary and never move it.

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
| Progress | community → membership | workflows → milestones → `communityFormRequests` |
| Money | community (Builder) / membership (paid access) | `founderSubscriptions`, `communityPricePoints` → `communitySubscriptions` |
| Accepted memory | community | traces → digests → `communityIntelligenceNodes` + `communityEvidenceCitations` |
| Member knowledge | user (+ community) | `memberFacts`, `memberProfileSpines`, `personalMemoryItems` |
| Agent conversation | user (+ community context) | `threads`, `cloudMessages`, `runtimeRuns` |

## Invariants

1. **Explicit, validated authority scope.** Every operation declares its scope
   (a community, a conversation's participants, the user's own account,
   Discover, or operator) and is authorized for it. Community operations pass
   the community guard chain: active → funded → not blocked → entitled → role.
2. **Authority is current.** It is re-derived from stored state on every
   request. Tokens and sessions identify an actor; they never grant authority.
3. **Same domain owners, same semantics.** UI, SDK, CLI, MCP and agents may
   use different adapters, but every one reaches the same domain owner with
   the same authorization and effects. No second source of truth.
4. **Fail closed.** Missing, malformed or ambiguous state denies.
5. **Provider-verified money.** Webhooks decide payment and entitlement;
   redirects grant nothing.
6. **Archive wins** over payment, role and membership. Restore is
   generation-fenced.
7. **Private stays private.** DMs, private form answers and personal memory
   never become shared memory and never cross communities.
8. **Memory is cited.** No accepted knowledge without an immutable source
   citation. Editing or deleting the source changes what can be reused.
9. **Durable effects are idempotent** and leave a receipt: admission, posts,
   submissions, approvals, payments, memory outcomes.
10. **An actor never exceeds its grant.** A member's front end acts as that
    member, inside that community, in the member lane. Founder administration
    from a custom front end needs separately authorized management operations,
    never an ordinary member session.

## Current product rules (configurable, not invariant)

- One founder plan: $79 per managed community, including a $20 model allowance.
- A 2.9% fee on paid-member revenue, versioned in commerce policy.
- One member workflow per community.
- One front end per community: the current Polynet UI today; vibe-coded front
  ends are planned.
- Entry policies: open, approval, paid.

## Audit evidence (not the core)

| Layer | Tables | Staging rows |
| --- | --- | --- |
| Core state | 59 | 11.0k |
| History and receipts | 31 | 81.3k |
| Derived and operational | 18 | 0.8k |
| Integrations and skills | 7 | 0.1k |
| Retired and legacy | 14 | 0.5k |

## Retirement candidates: dependency and data proof required

None of these is deletion-ready until its writers, compatibility obligations
and data are proven gone, following the two-release pattern in
[alpha-release-workflow.md](alpha-release-workflow.md).

| Candidate | Known state |
| --- | --- |
| Credit and workspace-compute tables, `legacyProgramGrants` | No writers found |
| AI feed tables | Feature retired; retirement module still present |
| `communityArchiveDocuments`, `communityOnboardingSessions` | No writers found |
| Legacy chat (`communityChatThreads`, `communityChatMessages`, `communityMessageReactions`, `communityInteractionLegacyChatLinks`) | **Still written:** `communityChat.createThreadUserMessage` and the legacy bridge. Duplicate substrate; prove callers and migration first |
| `communityFunnels` | Composer retired; records kept for audit |
| Seven app-mount tables | In progress: [#180](https://github.com/Neil-McD/Arx/pull/180) |
| 63 orphan tables on staging | Staging-only residue from other branches |

## Open risks

- **Unbounded history:** diagnostics and run events grow without retention.
- **Hot spots:** `communityResources.ts`, `communityIntelligenceDirectory.ts`,
  `threads.ts`. Add stable operation boundaries before exposing them.
- **Founder administration** from custom front ends needs its own authorized
  operations (invariant 10).
