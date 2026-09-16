# Channel roster reader

Baseline: staging efd150b62, whose tree matches 52a678fae. This slice does not
change the shell, existing presence leases, manager access editor, or runtime.

`communityChannelParticipants:listChannelRoster` requires current viewer read
access and returns only eligible people with channel read access. It derives
profiles from the canonical projection and public user IDs from the existing
chat/Members identity mapper. It derives eligibility from the existing
presence authorization and channel capability evaluators. Owners appear once,
on the first page. Admin access is implicit; private member grants retain their
membership activation lineage. Agent capabilities are separate from people.

Pagination reads at most 50 membership candidates per page (with bounded scan
budget). Restricted rooms can return empty non-final pages; consumers must keep
the cursor, deduplicate by user identity, and never infer total counts from a
page. Cursors are community/channel scoped. This intentionally trades sparse
pages for no duplicate membership index or new roster table.

`last_seen_at` and `active_until` reuse community presence leases, not channel-viewing
presence. An omitted channel ID resolves canonical General, including implicit
General before a stored channel exists. No grant metadata is exposed.

The channel-only sidebar separates Agents and People (Online, Offline, unknown).
Member rows reuse the existing DM action and member settings dialog. Desktop
actions appear on hover/focus; touch keeps them visible. The roster exposes a
membership ID only to managers, never for the owner. Existing membership
mutations remain authoritative. View all opens the community Members popup;
search, Auto-join and join-request review live there, not in the channel sidebar.
The standalone Members page is retired.
Agent rows share the chat ActorAvatar (purple community-agent tile) at the
canonical sidebar size, in one subtly bordered group. They represent identities
with channel access, not workflows or execution status; no online dots are inferred.
It reuses canonical UserAvatar and the existing lease predicate; its timer only
updates rendering, never issues heartbeats. Thread/profile drawers hide it while
preserving popup search and scroll. Narrow panes reuse the same roster.

One bounded page loads initially; scrolling requests another page,
including after an empty private-room page. Totals are shown only on completion.
The shared reactive pagination lifecycle invalidates descendant pages before
publishing changes, deduplicates displayed users, and clears on errors. A keyed
mount clears all rows on community/channel changes. No new tables or writes.

The sidebar header reuses the production community name and online facepile.
The facepile is community-wide presence, not a second channel roster. Memory
uses the authenticated canonical community overview (24-node preview budget)
and the production graph miniature. It is community memory, not private-channel
or member workflow context. The subscription closes when the sidebar unmounts;
errors clear the preview and expose Retry. No new polling, tables, or writes.

Staging deployment and live acceptance are separate from local test evidence.
