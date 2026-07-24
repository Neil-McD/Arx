# C2.3B2 Reply-Purge Surface Ledger — 2026-07-24

- Status: `COMPLETE` reduction map plus staging email-copy contraction;
  destructive reply purge remains unauthorized
- Source boundary: semantic staging
  `9331f446b47285b1b14ddd6d04998e683f0184de`
- Worktree:
  `/Users/neilmcdevitt/code/arx/.worktrees/semantic-platform-staging-20260719`
- Branch: `codex/semantic-platform-staging-20260719`
- Web project: `polynet-staging`; canonical host:
  `polynet-staging.vercel.app`
- Convex deployment: `dev:quick-porcupine-949`
- Staging-only implementation: email queue and receipt contraction plus bounded
  development-data migration
- Production changes: none

## 1. Irreducible job

This slice maps one job only:

> After an author has already tombstoned one canonical reply, remove the
> author's retained content from every Polynet-controlled copy without
> deleting the thread, another person's content, or unrelated community
> knowledge.

This is not account identity deletion, account access freeze, ordinary message
deletion, community deletion, or a generic lifecycle engine.

The existing tombstone mutation changes visibility and thread counts. It does
not erase content: the reply summary and blocks remain, and C2.3B1 deliberately
contains retained derived copies at read time rather than physically removing
them.

## 2. Classification language

| Disposition | Exact meaning |
| --- | --- |
| `PRESERVE SHELL, SCRUB CONTENT` | Keep structural identity required by shared history; blank or replace author-controlled content. |
| `DELETE` | Remove a rebuildable or wholly dependent product-controlled row. |
| `REDACT AND RETAIN` | Keep only the minimum operational or audit receipt; remove free text, snapshots, and content fingerprints that are not required. |
| `DELETE EXTERNALLY` | Confirm deletion at a provider or object store before recording the effect complete. |
| `DECISION REQUIRED` | Current lineage, retention authority, or independent-support semantics are insufficient for safe execution. |

Rows that merely point at the reply but do not copy its content are marked
`PRESERVE UNRELATED`. They are outside the five content-copy dispositions and
must remain byte-for-byte unchanged unless a separately owned policy says
otherwise.

## 3. Canonical graph

```text
communityInteractionReplies
|- communityInteractionContentBlocks
|  |- communityInteractionAttachments -> Convex storage / external object
|  `- communityInteractionEmbeds
|- communityInteractionMentions
|  |- communityMentionBroadcasts -> recipient mention rows
|  |- communityAgentServeRequests
|  |  |- provider prompt effect
|  |  |- communityAgentRunEvents
|  |  `- generated response root/reply
|  `- emailOutbox -> emailDeliveries -> recipient/provider copy
|- communityInteractionReactions
|- communityInteractionModerationEvents
|- communityInteractionLegacyChatLinks -> communityChatMessages
|- interaction source ref
|  `- communitySourceTraces
|     |- communityEvidenceCitations
|     |- communityCompilerDigests
|     |- communityIntelligenceNodes / communityIntelligenceEdges
|     |- communityIntelligenceChangeRequests
|     |- communityIntelligenceMutations
|     `- retrieval / outcome receipts
`- weekly digest selection -> emailOutbox -> recipient/provider copy
```

Recent-context and evidence-search snippets are computed projections, not
additional stored copies. C2.3B1 already prevents their reads after the
canonical reply is tombstoned.

## 4. Exact disposition ledger

### 4.1 Canonical interaction and direct descendants

| Surface | Content risk | Bounded lookup now | End-state disposition | First executable slice |
| --- | --- | --- | --- | --- |
| `communityInteractionReplies` | `contentSummary` is a direct copy. | Exact ID. | `PRESERVE SHELL, SCRUB CONTENT`: keep community/root/sequence/status/visibility/actor/timestamps/reaction summary; blank `contentSummary`. Authored-content purge does not detach identity. | Required. |
| Parent root | No copy of the reply; shared thread authority. | Exact `rootId`. | `PRESERVE UNRELATED`; do not change counts, content, or timestamps during purge. | Assert byte-for-byte preservation. |
| Replies targeting this reply | Structural reply relationship; another author may own the child. | `by_targetReply`. | `PRESERVE UNRELATED`. | Assert byte-for-byte preservation. |
| `communityInteractionContentBlocks` | Text, URL, workspace refs, mentions, and attachment/embed references. | `by_reply_order`. | `DELETE` every block for the reply, not only Markdown. | Required. |
| `communityInteractionAttachments` row | Name, MIME type, URL, content hash, creator and storage pointer. | `by_reply`. | `DELETE` after owned storage effects complete. | Reject any attachment row. |
| Convex `_storage` object | Raw uploaded bytes. | Exact `storageId`. | `DELETE EXTERNALLY` with idempotent effect receipt. | Deferred separate phase. |
| Attachment `externalUrl` | Pointer may reference an object Polynet does not control. | Exact attachment row. | Delete local pointer; remote deletion is `DECISION REQUIRED` unless provider ownership is proven. | Reject. |
| `communityInteractionEmbeds` | URLs, title, description, author metadata, image/video URLs and errors. | `by_reply`. | `DELETE`; it is a rebuildable preview copy. Do not refresh after request. | Reject initially to keep the first primitive irreducible. |
| `communityInteractionMentions` | Notification identity, state, and link to the source. | `by_reply`. | `DELETE` only after pending broadcast/agent/email effects are canceled or settled. | Reject any mention row. |
| `communityMentionBroadcasts` and recipient mentions | Fan-out state, actor, source IDs, recipient state; no source text. | `by_sourceReply`, `by_sourceMention`, `by_sourceBroadcast`. | `REDACT AND RETAIN` the minimum completed/canceled fan-out receipt; suppress pending recipients. | Reject any broadcast or fan-out. |
| `communityAgentServeRequests` | Source link plus derived provider/run/response effects. | Indirectly bounded through reply mentions and `by_sourceMention`; there is no `by_sourceReply` index. | `DECISION REQUIRED`; preserve generated content owned by other actors unless it contains dependent private content. | Reject any community-agent mention or serve request. |
| Generated agent response and run events | Response/reasoning can quote or paraphrase the reply. | Request links response IDs and run ID; run events use `by_run_seq`. | `DECISION REQUIRED`; independent-support and provider-retention rules are missing. | Reject. |
| `communityInteractionReactions` | Other users' expressive state, not a copy of the reply. | `by_reply`. | `PRESERVE UNRELATED`; keep reaction rows and aggregate byte-for-byte. | Assert preservation. |
| `communityInteractionModerationEvents` | Structural audit plus optional free-form `reason`. | `by_reply_createdAt`; idempotency index exists. | `REDACT AND RETAIN`: keep event type, target, actor, time, and deterministic key; do not store purge content in `reason`. | Reuse for request evidence only after uniqueness rules below are enforced. |
| `communityInteractionLegacyChatLinks` | Link points to a legacy content copy. | `by_reply`. | `DELETE` after the referenced legacy copy is handled. | Reject any link. |
| `communityChatMessages` | `contentJson` can contain the original reply and attachment payload. | Exact message through the legacy link. | `DELETE` with its link when the message is only bridge-era duplication; otherwise `PRESERVE SHELL, SCRUB CONTENT`. PC4 production-data compatibility remains a separate gate. | Reject. |

### 4.2 Notifications and external disclosures

| Surface | Content risk | Bounded lookup now | End-state disposition | First executable slice |
| --- | --- | --- | --- | --- |
| Mention email | A useful 140-character excerpt is an intentional recipient disclosure. | The outbox now stores only `mentionId`; send-time resolution rechecks the source and community access. | `KEEP UX, DELETE STORED COPY`: render from current canonical blocks and clear the reference at terminal state. | Complete on staging. |
| Weekly digest | Useful excerpts may come from current interactions, AI Feed posts, or Resources. | The outbox now stores only community, exact period, and activity counts; send-time selection reruns the bounded canonical readers. | `KEEP UX, DELETE STORED COPY`: no authored prose lives in the queue or terminal receipt. | Complete on staging. |
| Direct-message email | A useful 120-character excerpt is an intentional recipient disclosure. | The outbox stores only conversation and message sequence; participant, unread, mute, presence, preference, and message state are rechecked at send. | `KEEP UX, DELETE STORED COPY`; terminal receipts contain no DM text. | Complete on staging. |
| `emailDeliveries` | Provider events are operational evidence. | Provider event id, provider message id, normalized event type, and timestamps only. | `REDACT AND RETAIN`: raw webhook payload storage is deleted; provider retries are idempotent; minimal receipts expire after 90 days. | Complete on staging. |
| Delivered recipient email | The recipient or provider may retain the already-delivered text. | Not under Polynet database authority. | Honest external disclosure boundary; never represent delivered mail as erased from a recipient inbox. | Explicitly outside a product-store terminal receipt. |
| Community-agent provider prompt | The reply text is sent to the configured model provider. | Serve request identifies the effect, but provider deletion capability and retention are not encoded. | `DELETE EXTERNALLY` only when the provider contract and effect receipt support it; otherwise `DECISION REQUIRED`. | Reject agent-served replies. |

The staging email queue is no longer a content database. User-addressed jobs
resolve the current verified email at send time, content-bearing jobs hydrate
only after current authorization succeeds, terminal rows shed payload and
recipient email immediately, and terminal/delivery receipts expire after 90
days. The bounded staging migration minimized all 129 historical outbox rows;
an idempotent rerun reported zero remaining work.

### 4.3 Evidence, compiler, and accepted intelligence

The exact canonical source identity is
`interaction:reply:<replyId>`. `communitySourceTraces` is bounded by
`by_community_source`, and citations are bounded by `by_sourceTrace`. Most
downstream intelligence stores references in arrays with no reverse
source-trace index.

| Surface | End-state disposition | Current blocker |
| --- | --- | --- |
| `communitySourceTraces` | `REDACT AND RETAIN`: preserve source identity and terminal visibility; blank title/summary and compiler decision reason; remove content/provenance hashes and active compiler state. | Directly bounded and implementable. |
| `communityEvidenceCitations` | `DELETE`; citation fingerprints and captured source version are derived from the purged content. | Directly bounded by trace. Consumers must detach the citation first. |
| `communityCompilerDigests` | `PRESERVE SHELL, SCRUB CONTENT`: remove the affected item, recompute counts/summary, and delete an empty digest if no audit requirement remains. | `sourceTraceIds` live inside item arrays; no reverse index. |
| `communityIntelligenceNodes` | Delete a wholly dependent single-source node. Rebuild a multi-source node from independently readable sources and scrub the old content. | Arrays have no reverse index, and current schema does not prove whether prose is independently supported. |
| `communityIntelligenceEdges` | Delete a wholly dependent edge; otherwise detach the purged trace/citation and recompute evidence strength. | Arrays have no reverse index. |
| `communityIntelligenceChangeRequests` | `REDACT AND RETAIN` minimum decision audit; replace requested payload and decision reason with neutral receipt data. | Arrays have no reverse index; payload is opaque. |
| `communityIntelligenceMutations` | `REDACT AND RETAIN` operation/targets/actor/time; remove before/after snapshots, free-form reason, and purged trace references. | Arrays have no reverse index; snapshots are opaque. |
| Retrieval logs | `REDACT AND RETAIN` aggregate receipt; remove exact purged refs and free-form feedback that copied source content. | Evidence result refs are arrays; accepted-memory logs point to nodes rather than the source. |
| Outcome observations | Preserve independently authored metrics; scrub notes or delete observations dependent only on the purged source. | No direct source-trace lineage; decision/recomputation is required. |
| Metabolizer runs | `PRESERVE UNRELATED` counts, state, and independently retained node IDs. | Must update only if a dependent node is deleted. |

C2.3B1's read-time revocation is the correct immediate safety barrier. It is
not a physical-purge locator and must not be mistaken for one.

### 4.4 Audit, diagnostics, backups, and opaque payloads

`criticalAuditEvents.metadata`, `platformDiagnosticEvents.metadata`, and
several retained event payloads are allowlisted or operationally sanitized,
but none has a reply-first lookup. No first-party writer was found that
deliberately copies canonical reply text into critical audit or platform
diagnostic rows. The physical purge must therefore:

1. forbid new purge events from carrying message content;
2. preserve identity-only operational receipts;
3. fail closed if a known opaque writer can contain the source but lacks
   bounded lineage;
4. treat backup expiration, log retention, and provider retention as
   `DECISION REQUIRED`, not as silently completed work.

## 5. Request, idempotency, and interruption invariants

The existing event literals are schema vocabulary, not an implemented
workflow.

1. Only an explicit `privacy_purge_requested` event starts this job. A normal
   tombstone never implies privacy erasure.
2. The first supported subject is self-request only:
   `request.actorUserId == reply.actorUserId`.
3. The target must already be `status == "deleted"` and remain attached to its
   original root.
4. New request and completion events require deterministic keys, for example
   `privacy_purge_requested:reply:<replyId>:v1` and
   `privacy_purged:reply:<replyId>:v1`.
5. `idempotencyKey` is optional in historical schema and the
   `by_community_idempotencyKey` index does not enforce uniqueness. Every new
   executor must query the exact key with `.unique()` and fail closed on
   duplicate corruption.
6. Request persistence and local scrub are separate commits. If execution never
   starts, replay resumes from the durable request.
7. A bounded no-external-effect local scrub should be one Convex transaction:
   either all supported local copies and the terminal event commit, or none do.
8. External effects require their own confirmed effect receipt before terminal
   completion. Do not invent a generic checkpoint engine for the leaf case.
9. `privacy_purged` must not be written while any known unsupported,
   unbounded, or unconfirmed content-bearing descendant survives.
10. Parent root, sibling replies and blocks, child replies, reactions, and
    unrelated accepted intelligence must remain byte-for-byte unchanged.

## 6. Elon reduction decisions

| Challenged requirement | Idiot index | Decision |
| --- | ---: | --- |
| Show current canonical excerpts in digest, mention, and DM emails. | 1 | Keep; the email needs enough real value and context to perform its return-loop job. |
| Persist those excerpts in operational outbox rows. | 10 | Delete; store only bounded canonical lookup coordinates and render at send. |
| Keep sent email payloads indefinitely for reliability. | 10 | Delete; retain only minimum delivery evidence under an owned TTL. |
| Store complete provider webhook bodies for debugging. | 10 | Delete; normalized idempotent delivery evidence is sufficient. |
| Add a generic email-content lineage table. | 9 | Delete the requirement; the bounded queue can use the existing community/period, mention, and DM coordinates. |
| Add a generic lifecycle/workflow engine for one reply. | 9 | Delete the requirement. |
| Add reverse-index machinery to every intelligence table before deciding independent-support semantics. | 8 | Do not automate an undefined policy. |
| Delete another user's reaction or reply because its parent content was purged. | 10 | Forbidden. |
| Call read-time revocation or canonical-block deletion a complete privacy purge. | 10 | Forbidden. |
| Keep the structural reply shell so shared thread shape survives. | 1 | Required. |
| Require one explicit request, deterministic replay, and a terminal invariant audit. | 1 | Required. |

## 7. Verdict and next smallest slice

The originally proposed reply-only primitive is directionally correct but is
not implementation-ready with “reject attachments” as its only blocker.
Current ground truth still has three non-email terminal-boundary problems:

1. agent-provider and delivered-email copies may be externally irreversible;
2. compiler and intelligence references are not reverse-indexed and may be
   multi-source;
3. legacy message copies and opaque non-email retention surfaces are not yet
   closed.

The email surface-reduction blocker is closed on staging without deleting
useful excerpts. No table, public API, UI, user setting, generic lifecycle
engine, or content-lineage subsystem was added. A later reply purge must still
name delivered recipient email as an external disclosure and reject every
unsupported provider, legacy, and intelligence descendant.

After that, a canonical local leaf scrub may be built only with a non-lying
completion boundary. It must reject attachments, embeds, mentions, agent serve
requests, legacy links, and any source trace whose full derivative graph cannot
be bounded and resolved.

The email contraction does not authorize the destructive reply scrub. That
remaining C2 work stays paused while staging cleanup continues. Production
comparison and port planning are separately paused after PC3D.
