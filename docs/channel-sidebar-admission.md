# Channel sidebar admission control

Below the existing 680px chat-container breakpoint, the channel header opens the
same roster in place of the conversation. The conversation remains mounted.
Back or Escape restores it and returns focus to the People trigger. Channel,
community, thread, and profile navigation clear this local open state. Desktop
keeps its existing sidebar; there is only one roster instance and subscription.
The local browser fixture at `/qa?roster` provides a width toggle and draft input
to verify narrow open/Back/Escape, retained drafts, and desktop sidebar behavior.

The sidebar Auto-join switch is a projection of the existing community admission
state in App, passed through WebCommunityHost and the interaction projection.
It reuses the existing member-management save handler; it owns no additional
query, mutation, optimistic state, or channel access policy.

- Show only to managers when the community entry policy is known.
- Disable during an in-flight save; display the existing error beside the control.
- On selects community `open`; Off selects `approval`.
- Enabling retains existing behavior, including approval of pending requests.
- Private-channel visibility and membership remain unchanged.
- The Members page remains available; removing it is a separate slice.

Pending join review uses one shared `CommunityJoinRequestReview` renderer on the
Members page and channel sidebar. The existing lifecycle, community-scoped request
list, reviewer permission, and approve/deny callbacks remain authoritative. Only
free approval communities expose it; private-channel grants are unrelated. The
list starts collapsed, retains the 200-row display cap, exposes loading/errors,
and disables decisions while loading or deciding. No new polling or subscription
is added; newly arriving requests retain the existing lifecycle refresh behavior.

The compact switch markup and theme styles match the production sidebar control.
Admission controls do not depend on the channel roster loading successfully.
The request renderer lives in `CommunityJoinRequestReview.tsx`; both surfaces
consume it without owning a second request lifecycle. A local interaction fixture
is available through `node scripts/join_review_browser_qa.mjs` (synthetic callbacks,
no cloud writes). Check expansion, approve/deny receipts, pending/loading disabled
controls, and permission removal at `http://127.0.0.1:5197/qa`.
Live verification must not toggle a real community simply to test presentation:
that could admit pending members. Test transition delegation locally instead.

## Roster ordering

The channel right panel is the member-management surface; the separate Members
page and sidebar tab are retired. Old /members URLs resolve to channel chat.
General lists community members; restricted channels keep their authorized roster.
Search explicitly spans the community using the existing authorized, bounded
directory search. Search results retain profile and manager controls, without
claiming they belong to the current channel or inventing online presence.
Search continuation uses the same scroll loader, but automatic scanning is capped
at ten directory pages (at most 1,000 rows) per search/explicit continuation.
At the cap, the footer says search is paused and offers Continue search; it never
claims the partial results are exhaustive. Normal channel roster loading has no
Load more button. Failures expose Retry.

The old CommunityContextPanel renderer, its projection wrapper and exclusive
large-row styles are removed. Internal community_members route variants are
retired; only the incoming /members compatibility URL remains. Community
directory hydration is retained for mentions and profile consumers.

`listChannelRoster` reads the canonical community-presence recency index newest
first, then pages memberships that have no presence row. The owner follows the
same recency rule and is included once in the unknown-presence pass if needed.
Native index pagination breaks timestamp ties; no copied activity state or new
index is introduced. Each request performs one bounded pagination query.

The versioned cursor binds phase and position to the community and channel.
Every candidate still passes current community and channel authorization.
Filtered/empty pages advance through the shared production scroll loader (96px
threshold and underfilled viewport checks). No normal Load more button is shown.
One page is requested at a time without restarting existing subscriptions;
hidden rosters do not auto-drain pages. Failures retain an explicit Retry.
No individual request scans until it fills a page.
Mobile Members controls open the same channel roster, keeping the current chat
channel or navigating to General from another community page. One shell-owned
open state is scoped to viewer, community, and channel; Back/Escape return focus
to the opener. Public funnel previews retain their existing member overlay.
The directory controller retains only scoped rows, counts, and refresh for
mentions/profiles; its unused load-more and presentation-loading state are removed.
The existing reactive page subscriber invalidates descendant pages when an
ancestor changes, while the UI deduplicates public user IDs. Presence leases still
determine Online/Offline; ordering within those groups follows last-seen recency.
