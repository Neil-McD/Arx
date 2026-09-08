# Channel sidebar admission control

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
Live verification must not toggle a real community simply to test presentation:
that could admit pending members. Test transition delegation locally instead.

## Roster ordering

`listChannelRoster` reads the canonical community-presence recency index newest
first, then pages memberships that have no presence row. The owner follows the
same recency rule and is included once in the unknown-presence pass if needed.
Native index pagination breaks timestamp ties; no copied activity state or new
index is introduced. Each request performs one bounded pagination query.

The versioned cursor binds phase and position to the community and channel.
Every candidate still passes current community and channel authorization.
Filtered/empty pages may require Load more; no request scans until it fills a page.
The existing reactive page subscriber invalidates descendant pages when an
ancestor changes, while the UI deduplicates public user IDs. Presence leases still
determine Online/Offline; ordering within those groups follows last-seen recency.
