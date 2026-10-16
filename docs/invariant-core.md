# Polynet invariant core

Status: **draft spec**, October 16, 2026, from `main` at `6b7c269ec` and a
read-only staging snapshot. It defines what must stay true as Polynet becomes
infrastructure, with every community, including Polynet's own home, a
vibe-coded app on top. Code wins when it disagrees; fix this page.

## The model

```text
Polynet (infrastructure) ─┬─ identity, sessions          one account across communities
                          ├─ communities                 the unit of authority and data
                          ├─ community front ends        one vibe-coded app per community (planned)
                          ├─ payments                    Builder plan + paid membership
                          └─ intelligence + agents       memory, member agent, community agent, MCP
```

## Entities and relations

| Entity | Key tables | Belongs to | Notes |
| --- | --- | --- | --- |
| **User** | `users`, `userProfileDetails`, `authSessions` | none | One identity everywhere |
| **Community** | `communities` | owner (user) | Lifecycle, visibility, entry policy, funding mode |
| **Membership** | `communityMemberships` | community + user (unique pair) | Role, access source, activation sequence |
| **Channel** | `communityChannels`, `communityChannelParticipants` | community | All-members or restricted |
| **Contribution** | `communityInteractionRoots` → `…Replies` (+ attachments, mentions, reactions) | channel | The only community chat substrate |
| **Direct message** | `dmConversations`, `dmParticipants`, `dmMessages` | users | Cross-community; private |
| **Content** | `communityResourceModules` → `communityResources` (+ source units) | community | Curated knowledge |
| **Event** | `communityEvents` | community | Timezone and recurrence |
| **Progress** | `communityMemberWorkflows` → milestones → `communityFormRequests` | community → membership | One workflow per community; form versions pinned per request |
| **Money** | `founderSubscriptions` (community) · `communityPricePoints` → `communitySubscriptions` (membership) | community / membership | Provider-verified |
| **Memory** | `communitySourceTraces` → `communityCompilerDigests` → `communityIntelligenceNodes` + `communityEvidenceCitations` | community | Accepted knowledge, always cited |
| **Member knowledge** | `memberFacts`, `memberProfileSpines`, `personalMemoryItems` | user (+ community) | Never pooled into community memory |
| **Agent conversation** | `threads`, `cloudMessages`, `runtimeRuns` | user (+ community context) | Every turn recorded |

## Rules

1. **The community is the authority boundary.** Every read and write names
   one community and passes one guard chain: active → funded → not blocked →
   entitled → role.
2. **Authority is current, never cached.** Re-derived on every request from
   stored state. Tokens identify; they never grant.
3. **One canonical owner per object.** Every surface (UI, member agent,
   community agent, MCP, community front ends) calls the same domain owner
   through the canonical executor.
4. **Fail closed.** Missing, malformed or ambiguous state denies.
5. **Money follows the provider.** Webhooks decide payment and entitlement;
   redirects grant nothing. One 2.9% fee on paid-member revenue.
6. **Archive wins.** It overrides payment, role and membership.
   Restore is generation-fenced.
7. **Private stays private.** DMs, private forms and personal memory never
   become shared memory or cross communities.
8. **Memory is cited.** No accepted node without an immutable source citation;
   editing or deleting the source changes what can be reused.
9. **Durable effects are idempotent.** Admission, posts, submissions,
   approvals, payments and memory outcomes carry a receipt and safe retries.
10. **Front ends never exceed their member.** A community front end acts as
    the signed-in member, inside its own community, in the member lane only.

## Layers (129 tables)

| Layer | Tables | Staging rows | Rule |
| --- | --- | --- | --- |
| Core state | 59 | 11.0k | Canonical truth; changes only through owners |
| History and receipts | 31 | 81.3k | Append-only evidence; **needs a retention policy** |
| Derived and operational | 18 | 0.8k | Rebuildable or short-lived |
| Integrations and skills | 7 | 0.1k | Per-user or per-community connections |
| Retired and legacy | 14 | 0.5k | Delete with a data migration |

## What to retire

| Item | Why |
| --- | --- |
| `workspaceCreditBalances`, `creditLedgerEntries`, `workspaceComputeCharges`, `workspaceUsageCollections`, `legacyProgramGrants` | Credits and BYOK retired; no writers |
| `communityAiFeedPosts`, `communityAiFeedReactions` | AI feed retired |
| `communityArchiveDocuments`, `communityOnboardingSessions` | No writers or readers |
| `communityChatThreads`, `communityChatMessages`, `communityMessageReactions`, `communityInteractionLegacyChatLinks` | Second chat substrate; no UI calls it |
| `communityFunnels` | Composer retired; keep read-only until audit review |
| Seven app-mount tables | In progress: [#180](https://github.com/Neil-McD/Arx/pull/180) |
| 63 orphan tables on staging | Staging-only residue from other branches; clean staging |

Each retirement follows the two-release pattern in
[alpha-release-workflow.md](alpha-release-workflow.md): stop writes, empty
data, then drop the schema.

## Open risks

- **Log growth:** diagnostics (41k) and run events (24k) dominate staging and
  grow without a cap. Define retention before scale.
- **Hot spots:** `communityResources.ts` (10.3k lines), `communityIntelligenceDirectory.ts`
  (4.5k), `threads.ts` (4.3k). Put a thin, stable operation layer in front before
  exposing them to front ends.
- **Front ends:** "one front end per community" needs hosting and "Sign in with
  Polynet." Rule 10 already holds in the backend (#181's `community_app`
  principal); the Apps-tab and iframe parts of #181 are dropped.
