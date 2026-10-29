# Cleanup map — 2026-10-28

A sweep for obvious deletions, drift, duplicates and stale things. This page
records what was removed, what is in review, and what waits on Neil.

## Done (outside the repo)

The local branches and stashes are backed up in
`~/code/arx-local-backups/branch-archive-20261028/` (one verified git bundle
with every branch and stash, a branch list, and stash patches; restore steps
in its README). The 12 stashes are still in place.

| What | Before → after |
| --- | --- |
| Remote branches already merged into `main` | 318 → 58 |
| Local branches already merged | 634 → 227 |
| Remaining local branches (backed up first, never pushed) | 238 → 5 |
| Remote branches (merged, or archived as `archive/…` tags) | 58 → 8 |
| Worktrees | 16 → 5 |
| Staging Convex env vars no code reads | 17 removed |
| Old staging site-route KV keys | 4 removed |
| Staging UI Canary workflow (failing, superseded) | disabled |

## In review (repo)

| PR | What it removes or fixes |
| --- | --- |
| #271 | Config clutter: the `mvp` workflow trigger, 15 dead `.env.example` vars, `.env.convex.quickstart.example`, `design-qa.md`, the `vercel.json` preview 404 tombstones. |
| #272 | Gate duplicates: the foundation gate no longer runs `npm test` twice; 12 vitest-only check aliases, 19 vitest tails and 6 dead scripts/contracts deleted. Foundation baseline 47.8s → ~21s; `check:all` 181 → 157 checks. |
| #273 | POL-30: cached-production contract refreshed to 150828216; funnel stand-ins, the integrations stub, `asPersonalAgent`, the legacy attachment shape, the `ai_feed` surface and `reorderCommunityChannels` deleted. |
| #274 | Product docs (what the community agent reads): one community agent, the join page, sites; skills docs deleted; retired claims removed. |
| #275 | The uncalled-functions proof matched by prefix; now whole-word. `getMyOperatorAccess` deleted. |
| pending | Dead UI: unused CSS, constant props, unused locals and exports, two unused root dependencies. |

## Waiting on Neil

### Protected core (needs explicit confirmation to touch)

- **Agent doctrine prompt.** `PLATFORM_DOCTRINE` in `shared/runtimePrompt.ts`
  still tells the agent Polynet sells "agent harnesses, apps and workflows".
  A one-paragraph rewrite matching the product docs is ready.
- **Four uncalled functions** named in `no_uncalled_functions_proof.ts`:
  `communityCompilerDigest:runCommunityCompilerDigestPass`,
  `communityResources:listCommunityResourceBuilderDirectory`,
  `communityResources:readCommunityResourceBuilderResource`,
  `threads:cancelCloudRuntimeRunByThreadKey` (the HTTP route uses its internal
  twin). Recommendation: delete all four.

### Data and production

- **Table drop (POL-31).** 27 retired tables. Needs a production backup first.
- **Production release.** Production still runs 150828216; main carries the
  avatar-deletion security fix (#267) and everything above.
- **Production env vars.** 8 production vars no code reads; 23 coding-harness
  vars on staging. Remove them?
- **42 unmerged branches with no PR.** Recommendation: tag each
  (`archive/<branch>`), then delete the branch.
- **Staging sites.** The old `polynet` staging site (no frame) and the two QA
  sites: rebuild with a frame, or delete.
- **Weekly digest.** It has code but no cron. Schedule it or delete it.
- **Root checkout.** `/Users/neilmcdevitt/code/arx` has uncommitted edits, two
  unmerged-conflict files and 12 stashes. Archive them like the Oct 27
  worktree archive?

### Product decisions surfaced by the sweep

- **Join rule wording** in `AGENTS.md` ("canonical join destination") vs. joining
  on a site (#269).
- **Site as home by default** for communities that have one.
- **Moderators** can't moderate anywhere today. What may they do?
- **Public Discover vs. the $79 page.** Signed-out visitors can't browse Studio
  Discover; Studio's home sells $79 while the direction is free communities.
- **Builder permissions on the Agent page.** The code gives owners/admins
  builder actions there; `docs/community-agent-conversations.md` says members
  never inherit them. One of the two is wrong.
- **`PLATFORM.md` / `SOUL.md`**, archive policy, pricing copy.

### Bugs found (membership and money are risk-high: Neil's OK to fix)

- Rejoining restores the old role.
- The twin member check misses a lapsed paid subscription.
- A visibility update with an unknown value publishes the community (fails open).
- Idempotency keys are cut at 160 characters, so long keys can collide.
- Staging emails link to production (`directMessageEmails.ts`, `emailCore` fallback).
- DM attachments trust the client's MIME type and size.
- Studio silently truncates long messages.
- Lapsed members still get reminders and digests.
- Grandfathered communities get `founder_plan_required` from the agent.
- Join review is gated differently in Studio and the MCP.
- Dead ends: the DM email when signed out, no join-denied email, the billing-issue email.

## Next sweeps

- Done: `listMyCommunityAttention` deleted; its tests read the paged query.
- One-off backfills (channel names, resource module statuses, membership
  active flags, bridge social-link facts, the General-channel migration and
  audit): delete once a read-only production check shows they finished.
- Studio doesn't know sites exist (links, settings, Discover cards).
