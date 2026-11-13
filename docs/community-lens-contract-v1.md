# Community Lens Contract (v1)

What a community is made of, and what each role can read, write and do with
each part, on every surface. Approved direction: Neil, Nov 4 2026 (POL-42).
Code that decides access reads from one place, the lens
(`resolveCommunityLens` in `convex/communityCore.ts`, and for agents and the
MCP `derivePolynetHumanAuthority` in `shared/polynetAuthority.ts`); this
document is what those must agree with.

## First principles

1. A community is a small set of **things**. Every thing has the same three
   kinds of capability: **read** (see it), **write** (create, edit, delete)
   and **act** (verbs that aren't editing: approve, mark done, remove, tag,
   pin, send).
2. **Every action works on a selection.** One item is a selection of one.
   The same verb serves a single click, a checkbox selection in Studio, and a
   list from someone's own AI. Each item is decided on its own, with its own
   receipt, so a retry never repeats one. A selection is at most 50 items.
3. **One lens per person per community.** A person's relation (member,
   moderator, admin, owner) decides what they can do. Every surface (Studio,
   the community's site, the community agent, the MCP) shows the same lens;
   a surface may show less, never more.
4. **Who is acting is part of the lens.** A person directly, their site for
   them (member lens, even for the owner), the community agent answering them
   (member lens, drafts only), the community agent for the community (sees
   only what everyone sees), or their own AI through the MCP (their full
   lens).
5. **Money and irreversible steps are confirmed by a human.** An agent can
   prepare them; a person confirms in Polynet.
6. **Fail closed.** No membership, no entitlement, a blocked member or a
   community that can't run: no access.

## Roles

- **Member:** an entitled member.
- **Moderator:** a member who also keeps the community healthy: removes
  posts, reviews join requests.
- **Admin:** runs the community with the owner, except owner-only things.
- **Owner:** everything, including identity, publishing, payouts, archiving
  and admins.

Each role includes everything the roles above it in this list can do.

## The things

R = read, W = write, A = act. "Now" is what exists; "Planned" is the order
of the slices that follow.

### 1. The community itself
- Member: R name, one-liner, about, handbook, how to join.
- Admin: W about, one-liner, handbook (draft with the agent, approve), join
  mode (open or by approval), agent instructions.
- Owner: W name, slug, visibility, branding, where members spend time
  (Polynet's app or the community's own deployed site). A: archive (confirmed).
- MCP now: owners and admins read `builder/community.json` and change the
  community through `community.settings.update` (owner: name, slug,
  visibility; admins too: one-liner, about; naming the revision they read),
  `community.join_mode.set`, `community.agent.instructions.set`,
  `community.handbook.save_draft` and `community.handbook.approve`, through
  Studio's own domain functions. Asking to change where members spend time
  (`community.member_experience.request`) was retired with custom sites
  (Nov 13 2026); a community's stored choice still decides.
  Planned: pictures; archive (confirmed).

### 2. People
- Member: R directory, member cards, shared activity, who's online. W own
  profile. A: DM, block.
- Moderator: A on a selection: approve or deny join requests.
- Admin: A on a selection: change role (not admins), remove, ban, unban,
  invite.
- Owner: as admin, including admins.
- MCP now: reads; moderator join review on a selection; owners and admins
  change role (`community.members.set_role`), remove, ban and unban
  (`community.members.remove`, `.ban`, `.unban`) a selection of up to 50. Through an AI,
  removing or banning a paying member is refused (`paid_member_use_studio`:
  it cancels their subscription, so a person does it in Studio). Planned: own
  profile; invite.
- Tags on people were built and never used; they were deleted Nov 7.
  A selection never sends direct messages in bulk.

### 3. Conversations
- Member: R the channels they can see, posts, threads. W own posts and
  replies (edit, delete own). A: react, mark read, ask the agent.
- Moderator: A on a selection: remove anyone's post.
- Admin: W channels (create, rename, order, private, delete). A: pin, give
  people access to a private channel, post to @everybody.
- DMs: each member's own, never another's.
- MCP now: member reads and writes; moderator removal on a selection.
  Planned: channel setup; DMs (own only) by decision.
- Pods (proposed): see `specs/pods-v0.md` (a paid, higher-touch group that replaces private channels).

### 4. Learning
- Member: R courses and lessons. A: mark a lesson done (private to them).
- Admin: W courses, lessons and their order.
- MCP now: member reads and lesson progress; builders stage course changes
  for approval. Planned: direct course writes; a course for a tag.

### 5. Events
- Member: R events. A: RSVP (not built).
- Admin: W events. A: cancel.
- MCP now: read. Planned: writes.

### 6. Knowledge
- Member: R community notes and files. Nobody but owners and admins changes
  notes; the community agent reads them and never writes them.
- Admin: W notes (edit, delete), files and sources.
- MCP now: read. Planned: note edits.

### 7. The community agent
- Member: talks to it; it acts only as them and drafts what it can't send.
- Admin: W instructions. R the daily brief and what the agent did.
- The community agent never acts as the owner on its own.

### 8. Site and money
- Admin: A deploy the community's site. W pricing (confirmed).
- Owner: payouts and the founder plan (Stripe; a human confirms).
- MCP now: site deploy (builders). Planned: pricing, confirmed.

## Surfaces

| Surface | Lens |
|---|---|
| Studio | The person's full lens. |
| The community's site | Member lens; moderators moderate through the signed-in site. |
| The community agent, answering a member | Member lens; drafts only. |
| The community agent, for the community | What every member can see; never private rooms, DMs or anyone's progress. |
| The MCP, the person's own AI | The person's full lens: member, moderator or builder. |
