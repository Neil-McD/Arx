# Lenses and contexts map (v0, for review)

Status: draft for Neil's review, Oct 28 2026. Built from a click-through of
Studio on staging (as owner and as a signed-out visitor) and three code maps
(roles and permissions, contexts and entry points, data model). Code
references are to the stack on `claude/POL-47-site-join`; file:line detail
lives in the PR description and can be regenerated.

## The mental model: five questions decide every screen

Every screen Polynet shows is the answer to five questions, in this order:

1. **Who are you?** Signed out, or a Polynet account (`users`).
2. **What is your relation to this community?** Computed in one place,
   `resolveCommunityAccessBundle` (`convex/communityCore.ts`):
   `owner` (from `communities.ownerId`, never a stored role) · `admin` ·
   `moderator` · `member` (stored on `communityMemberships.role`, only if
   entitled) · `pending` (a join request) · `visitor` (signed in, not in) ·
   blocked (`communityBlocks`). Signed out has no relation, only public views.
3. **Is the community able to run?** Archived → nothing. Otherwise the
   builder plan decides (`resolveCommunityBuilderAccess`): grandfathered,
   an attached founder subscription, or the platform owner's comp. Paid
   communities also need the member's subscription (`active`, `past_due`,
   `cancel_at_period_end`).
4. **Where are you?** Studio (polynet.ai), the community's site
   (`<slug>.polynet.page`), its private twin (`<slug>--me.polynet.page`), an
   email, the MCP/CLI, or talking to the agent.
5. **Who is acting?** You directly (`human`), the site acting for you
   (`community_app`, always the member lane), the agent acting for you
   (`community_agent_for_member`), the community's own agent
   (`community_agent`, member lane, never a manager), or your own AI through
   the MCP (`external_mcp`, builder-only).

A **lens** is the combination of (2) relation × (4) surface: what you see and
can do there. The guard order is always: community active → funded → not
blocked → entitled → role.

## Who can do what today

`Mgr` = owner or admin. `Mod` = owner, admin or moderator. Everyone needs
the guard order above.

| Action | Who (server) | Studio | Site / twin | MCP |
|---|---|---|---|---|
| Read, post, reply, react in a channel | Entitled; restricted channels need Mgr or a grant; managers-only posting | ✅ | ✅ | ✅ |
| Edit / delete own post | Author | ✅ (Edit also shown on agent posts, then refused) | ✅ | own deletes; can't edit its own MCP posts |
| **Delete others' posts (moderate)** | Mod | **No UI** (server allows it) | ❌ | ❌ |
| @everybody | Mgr | ✅ | ❌ | — |
| Channels: create, rename, archive, restrict, pin, grant | Mgr (moderators are NOT channel managers) | ✅ | ❌ | ❌ |
| Events: create, edit, cancel | Mgr | ✅ inline on Events | read only | read |
| Courses / resources: edit, drafts | Mgr | ✅ inline + Preview mode | read live only | builder changesets |
| **Join requests: review** | Mod in Studio, **Mgr in MCP** | ✅ | ❌ | Mgr only |
| Open vs approval | Mgr | ✅ | ❌ | ❌ |
| Roles, remove, ban | Mgr; only the owner touches admins | ✅ member "…" menu | ❌ | ❌ |
| About / one-liner | Mgr | ✅ | ❌ | ❌ |
| Name, slug, branding, visibility | Owner | ✅ | ❌ | ❌ |
| Pricing / payouts | Mgr (+ payouts ready) / Owner | ✅ | ❌ | ❌ |
| Agent instructions | Mgr | ✅ | ❌ | ❌ |
| Analytics, workflows | Mgr | ✅ | ❌ | milestones |
| Archive | Owner | ✅ | ❌ | ❌ |
| Deploy the site | Owner/admin | — | — | ✅ CLI/MCP |
| DM someone | Any two members of a shared community, no block | ✅ | ✅ twin only | — |
| Members, presence, profiles | Entitled | ✅ | ✅ | read |
| Ask the agent | Entitled + community funded | ✅ (owners get the builder lane) | ✅ (always member lane) | — |

## Every way in, today

| Entry | Goes to | Problem |
|---|---|---|
| Studio Discover card | Studio community (member) or Studio join page | **Never the site.** Studio knows nothing about sites |
| Signed-out Studio Discover | Redirects to the marketing home | **Visitors can't browse Discover** |
| Studio home (signed out) | Marketing: "Start with Polynet — $79/month" | Contradicts free communities |
| Shared / invite link | Studio `/c/<slug>` (name, one-liner, Join) | Bypasses the site |
| Access-granted email | Studio `/c/<slug>/chat` | Bypasses the site |
| Mention email | Studio chat/channel | Bypasses the site |
| DM email | hardcoded `www.polynet.ai/?dm=<id>` | Bypasses the twin; **signed out, the conversation is lost after sign-in** |
| Weekly digest, event reminder, founder brief | Studio tabs | Bypass the site; event reminder doesn't open the event |
| Join denied | **no email at all** | Gap |
| Billing issue (member, past due) | Studio community settings | **Dead end**: members have no billing page there |
| Site Discover / Your communities | The community's own site, else Studio join page | ✅ |
| Site Join | Twin `/join` | ✅ (shares the funnel's join core) |
| Site "Manage this community" | Studio settings | Pending 3c |

## Data model essentials

- **Identity:** `users` (+ `userProfileDetails`, which wins for name/avatar).
- **Ownership** is only `communities.ownerId`; the owner has no membership row.
- **Membership:** `communityMemberships` (role admin/moderator/member,
  `accessSource` free/manual/paid, `active`, `revokedAt`,
  `activationSequence`). "Left/removed/banned" are `revokedReason`s; bans also
  live in `communityBlocks`.
- **Paid access:** `communityPricePoints`, `communitySubscriptions`,
  `checkoutSessions`; webhook-verified.
- **Builder plan:** `communities.builderAccessMode` +
  `founderSubscriptions` (+ `operatorRoles` owner comp).
- **Channels:** `communityChannels` (`accessMode`, `postingPolicy`,
  `replyPolicy`) + `communityChannelParticipants` (grants bound to the
  membership activation, so rejoining resets grants).
- **Sites:** `communityDomains` (`kind` site | private) →
  `communityAppSessions` (`kind`), routes in Cloudflare KV.
- About 20 tables have no writers left (retired features); they drop with the
  planned table-drop release.

## Problems found (prioritized)

**Correctness / security — fix first**
1. **The twin's membership check is weaker than everywhere else.**
   `communityAppMemberRole` (`convex/communityApps.ts`) checks the community
   is active and `membership.active === true`. Removal and bans also set
   `active: false`, so those are covered, but it misses a lapsed paid
   subscription and a community whose builder plan no longer lets it run. It
   gates twin Settings and Messages (Messages still applies Studio's full DM
   relationship check, so DMs themselves stay protected). Replace with the
   canonical chat-access chain.
2. **Rejoining restores the old role, including admin.** Removal and ban keep
   `role`; open rejoin and approval reactivate the row with it. A removed
   admin approved back by a moderator is an admin again. Reset to `member` on
   reactivation.
3. **`effective_role` is the raw stored role** even when revoked/unentitled;
   Studio uses it for the admin settings layer (server still refuses writes).
4. **Paid checkout forces `member`**, so a lapsed paid admin who renews is
   demoted (uncertain how reachable).

**Lens gaps**
5. **Moderators can't moderate anywhere** (server allows; no UI).
6. **Join review: Studio allows moderators, the MCP requires managers.**
7. **Grandfathered communities run but their agent says `founder_plan_required`.**
8. **`past_due`** keeps member access but not founder-plan access.
9. **Visibility defaults disagree** (server: published; shared: unlisted).
10. Event `visibility: public` is stored but never honored.

**Front door**
11. Studio doesn't know sites exist: Discover, invites, every email.
12. Signed-out visitors can't use Studio Discover; Studio's home sells $79.
13. Dead ends: DM email when signed out, no join-denied email, billing email.
14. The builder guide still says DMs stay in Studio.

**Structure**
15. The chat-access chain is implemented four times and "manager" five
    times; each copy drifts (1 and 6 above are symptoms).
16. MCP and member-agent posts are stored as agent posts, so their authors
    can't edit them.

## Target architecture (proposal)

1. **One lens resolver.** A single function returns, for (user, community,
   surface, principal): the relation, entitlement, the community's operating
   state, and a flat capability set (`can_post`, `can_moderate`,
   `can_manage_channels`, `can_manage_events`, `can_review_joins`,
   `can_manage_roles`, `can_manage_settings`, `can_manage_payouts`, …).
   Every guard (Studio mutations, site API, twin, MCP, agent) calls it; the
   four chat-access chains and five manager checks go. Surfaces then only
   *narrow* it (e.g. the site's code acts in the member lane; personal data
   only on the twin), never re-derive it.
2. **One front-door resolver.** `communityHome(community)` → the site if one
   is deployed (and the founder hasn't turned it off), else Studio. Every
   link builder uses it: Studio Discover, invites, every email, MCP replies.
   Deep links map 1:1 (Studio chat ↔ site `/chat`, Studio DMs ↔ twin
   `/messages/<id>`, event ↔ `/events/<id>`), with a resume intent through
   sign-in so nothing is lost.
3. **Lenses, not pages** (your rule). Powers appear where the thing lives:
   moderators see delete/hide on posts; managers see channel controls in the
   channel list, Edit/Cancel on events, join requests where members are
   listed, role menus on profiles; owners get a Preview-as-member switch (as
   Studio's Knowledge already has). `/manage` on the twin only for things with
   no natural page (identity, pricing, payouts, agent, danger).
4. **Outside vs inside.** Outside = the community's public front (its site's
   home for visitors, or Studio's join page when there's no site) and the
   network Discover (public, signed-out friendly, Studio and sites showing the
   same list). Inside = the lens for your relation. Studio stays the
   Polynet-wide app: your communities rail, DMs across communities, account
   and billing.

## Proposed order

1. **Lens correctness fixes** (problems 1–4, 6–9): small, server-side,
   tested. The twin membership fix is urgent before personal pages merge.
2. **One lens resolver** (problem 15), replacing the duplicated chains.
3. **Front door** (problems 11–14): `communityHome`, Studio Discover and
   emails to the site/twin, signed-out Discover, resume-through-sign-in, the
   missing emails.
4. **Moderator lens** on sites and Studio (problem 5).
5. **Admin lenses + `/manage`** (3c).

## Decisions for Neil

1. Should a community with a site **always** use it as its home, or can the
   founder choose? (Recommend: default to the site once deployed, with a
   switch.)
2. Is "free or paid to join" enough, or do you want **tiers inside a
   community** (e.g. paid members see more)? (Today: equal members plus
   restricted channels by grant.)
3. **Join rule in AGENTS.md:** OK to change "the funnel is the single
   canonical entry surface" to "one join logic, shown in the community's
   world or on Studio"?
4. **Studio's signed-out home and Discover:** keep the $79 marketing page, or
   make the public front a Discover of communities (free platform, paid AI)?
5. Moderators: should they also manage channels and events, or only content
   and join requests? (Today: content (no UI) + join requests.)
