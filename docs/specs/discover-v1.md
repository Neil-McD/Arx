# Discover (v1)

Status on 2026-11-16: the list (this document's "What is listed" and "What a
card carries") is built; the page is next. Mock:
`/design-lab?page=discover` on staging (`&phone=1`, `&many=1`).

## What it is

One page where communities are listed, for someone looking for one to join.
Nothing fancy: a grid of cards, search once there is enough to search.

## Where it lives

- Signed in: a page of the community you are in, `/c/<slug>/discover`, reached
  from the community switcher. The community's left column stays as it is,
  with nothing picked. Opening it is a history step.
- Signed out: the same cards in the public frame at `/discover`. A signed-in
  member who opens `/discover` is moved into their community's frame.
- Someone in no community yet keeps the simple left column.
- No right panel.

## What is listed

Published, active communities that look finished: a banner and a one-liner
(`communityLooksFinished` in `convex/communityPublic.ts`). Most recently
active first. A host whose published community is missing either is told so
in the community's settings.

## What a card carries

`communityPublic:listPublicDiscoverCommunities` sends, per community: name,
one-liner, banner, avatar, the plan's price, how you get in, and (Nov 16):

- `host`: the owner's name and face.
- `member_count`.
- `last_active_at` and `posts_this_week`: posts by people that the community
  can see, in the last seven days, counted up to 50. Never the guide's own
  posts, a removed post, or a private talk with the guide.

On the card: a post in the last 24 hours reads "Active today"; otherwise the
week's count ("9 posts this week"); a quiet week shows nothing. Prices are
neutral; an approval community reads "Free · ask to join".

## The page

New communities first, three across. The ones you are in are a quiet row
last ("You're in"), each opening the community. Then "Don't see yours? Start
a community". Search appears past eight communities. On a phone: one card per
row. A card opens the community's landing page (`/c/<slug>`).
