# Channel roster reader

Baseline: staging efd150b62, whose tree matches 52a678fae. This slice does not
change the shell, existing presence leases, manager access editor, or runtime.

`communityChannelParticipants:listChannelRoster` requires current viewer read
access and returns only eligible people with channel read access. It derives
profiles from the canonical projection and eligibility from the existing
presence authorization and channel capability evaluators. Owners appear once,
on the first page. Admin access is implicit; private member grants retain their
membership activation lineage. Agent capabilities are separate from people.

Pagination reads at most 50 membership candidates per page (with bounded scan
budget). Restricted rooms can return empty non-final pages; consumers must keep
the cursor, deduplicate by user identity, and never infer total counts from a
page. Cursors are community/channel scoped. This intentionally trades sparse
pages for no duplicate membership index or new roster table.

`last_seen_at` is community presence evidence, not channel-viewing presence or
an assertion of online/offline status. The future UI must reuse the existing
presence lease contract and handle unknown presence. It must clear accumulated
pages on channel changes or authorization failure. No grant metadata is exposed.

UI integration and staging deployment/acceptance remain separate gates.
