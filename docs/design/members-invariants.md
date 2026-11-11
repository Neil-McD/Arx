# Members: what the page must never leave out

The checklist every Members slice is checked against (Neil, 2026-11-11). The
mock (`docs/design/hifi-mock`, Members tab) draws these; the backend already
records most of them (`communityMemberships`, `communityPricePoints`,
`communitySubscriptions`, `communityBlocks`, `communityJoinRequests`,
`memberFacts`).

Members is one page with two lenses (host and member), never two pages.

## 1. Every way someone is in

A host can always tell these apart, on the row and in a saved view:

- Paying, and at which price. A price that was raised keeps its people: a
  membership records the price point it joined at, and old price points are
  archived, never deleted. "Founding · $7" and "Member · $27" are two views.
- Free (a free community).
- Comped (access granted by hand).
- Staff: owner, admin, moderator. A moderator can also be a paying member.

## 2. Every money condition

Each has a visible state on the row and in the record:

- Payment on hold (card failed, access running out, with the date it ends).
- Cancelling (paid up, leaving at period end, with the date).
- Refunded. Disputed. Lapsed.

## 3. Every way someone is out

People who are out never vanish. "Past members" keeps the record, notes and
history, so a rejoin shows the whole story:

- Left on their own. Removed by a host. Lapsed. Blocked.
- Asked to join: pending or declined.

## 4. What a host can always do

Message; change role; grant or remove free access; remove; block; approve or
decline a request; add a note. Removing and blocking confirm first. Each action
leaves a trace on the record: who, and when.

## 5. What a host can always see about a member

- What they have said about themselves, each with where it came from. A guide's
  guess is marked as a guess, never shown as the member's own words.
- Their trail in the community.
- Their plan, price and payment history.
- How they arrived (who invited them, which link).
- Notes, the host's and the guide's.

## 6. What a member can always count on

- Other members never see their plan, price, payment state, notes or
  last-active time.
- They can see what is known about them, and take it back.
- The guide's guesses about them stay hidden from others until they approve.
- Leaving removes them from member-facing pages at once.

## 7. Scale and finding people

- Works at 5,000 members: search, sort, filters, paging.
- Counts on saved views are true counts.
- Export to CSV: the host owns their list.

## 8. Edge cases that must not break the page

- No name, no photo, no facts (the empty record is drawn, not an error).
- The same person in several of the host's communities.
- Joined, left and rejoined at a different price.
- An admin viewing: manages members, sees no payouts.
- A price that no longer exists but still has people on it.

## Open

- Moving a member between prices by hand (a $27 member onto the $7 founding
  rate). Not built; Neil decides.
- Custom columns and custom views. Fixed columns and saved views first.
