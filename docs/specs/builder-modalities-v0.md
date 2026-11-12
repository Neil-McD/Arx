# Builder modalities: one door (v0)

Status: agreed with Neil on 2026-11-07 as product direction; simplified with
Neil on 2026-11-12 to **two modes and one rule** (below). Built so far is
under "Build status".

## Two modes, one rule (Nov 12)

**The commission follows the checkout.** A sale through Polynet's checkout pays
Polynet's 2.9%; a sale a builder's app makes through its own checkout, and
reports to Polynet, pays nothing. A person's access is the union of what each
side sold them. That gives two modes, with no setting to choose between them:

1. **Polynet is the only checkout:** commission on both sides (community and
   product). Community-only builders, and products built on Polynet.
2. **The builder also sells through their own checkout:** commission on the
   Polynet side only. Someone who finds the product through Polynet buys
   through Polynet's checkout; someone who finds it on the builder's own site
   buys there. Distribution Engineer is this mode.

A builder is in mode 2 the moment their app reports its own sales. "Came
through Polynet" means "paid through Polynet's checkout"; commission on later
off-Polynet purchases (referral tracking) is the deferred affiliate system.
The three modalities below are the original Nov 7 framing, kept for history.

## The thesis

Services, software and community are converging into one service:

- **Software does the work** (Distribution Engineer runs campaigns; a fitness
  app runs programmes).
- **Information makes the software smarter and explains what's happening**:
  the community agent's memory of each member, their goals and progress.
- **People make it stick**: community, coaching, support and belonging. This is
  the moat; the software can be copied, the relationship around it can't.

Polynet is where those come together: a community with an agent that helps
members execute at scale, keeps track of where each one is, and couples
tightly to the builder's own product.

## Who it's for, in order

1. Builders selling software or a service who want community, support and an
   agent around it. Distribution Engineer is the archetype; Neil is customer
   zero.
2. Coaches and course sellers: the same shape, with a programme instead of an
   app.
3. Pure communities (streamers, gamers). They must work well, but they don't
   set priorities.

## The three modalities

### 1. Community only

The community, coaching or content is the product; there is no separate app.

- Members buy through Polynet's checkout (Stripe Connect on the builder's
  account). Polynet takes its 2.9% application fee.
- The agent, if used, is paid for separately.
- Works today; more than one tier comes with "plans with grants" below.

### 2. Building a product on Polynet

The builder is creating software, and **Polynet is the only gate**: one
purchase and one sign-in give access to both the community and the app.

- Members buy through Polynet's checkout (Stripe Connect); Polynet takes 2.9%
  on everything sold.
- The app relies on Polynet for identity and entitlement: "Sign in with
  Polynet", an access check, and notifications when someone's access changes.
- The builder never builds login or billing.
- Tiers move together: a community plan carries the app tier with it (for
  Distribution Engineer, $47 / $197 / $297 → Connect / Setter / CRIS).

### 3. Already has a product

The builder's app keeps its own login and billing and does most of the selling.

- The app brings its customers into Polynet ("this person is a customer, on
  this tier"); Polynet invites them into the community.
- They come for the agent and the community around their product, and pay
  Polynet for the agent.
- No Stripe Connect and no fee on sales made in their own app.

## The money rule (all three)

- **The fee follows the checkout, not the kind of builder.** Any sale through
  Polynet's checkout pays 2.9%; any sale through the builder's own checkout pays
  Polynet nothing.
- **Everyone who uses the agent pays for the agent.**
- Why this is fair: a modality-2 builder pays on every sale because Polynet runs
  their sign-in, checkout, plans, upgrades, refunds and app access. A
  modality-3 builder who also sells in the community pays the same 2.9% on
  those sales. Avoiding the fee means building and running your own login and
  billing, which is the cost the fee spares you.
- Modality 3 selling inside the community (connecting their existing Stripe
  account so community sales land beside their app's) follows the same rule,
  but is **deferred** until a builder asks for it.

## The contract (shared building blocks)

- **Plans carry grants.** A plan is a price plus named grants (`community`,
  `de:connect`, `de:setter`, `de:cris`). Apps read grants, never prices.
  Upgrading or downgrading swaps the plan on the same subscription. Model it
  this way from the start, even when a builder has one tier.
- **One owner per grant, so no drift.** A grant sold through Polynet's checkout
  is owned by Polynet; a grant reported by the builder's app is owned by the
  app. A person's access is the union. Nothing is copied back and forth.
- **Sign in with Polynet** (OAuth / OpenID Connect) for modality 2. Each
  connected app gets a client ID, a secret and allowed return addresses per
  community.
- **Access check and notifications:** "what does this person have in this
  community?", plus signed webhooks when access is granted, changed or ended.
- **Onboarding call** for modality 3: the app adds a person with a tier;
  Polynet invites them, linked by verified email.
- **The agent bridge** (all modalities): the app sends each member's progress
  in; the agent acts in the app through tools (MCP both ways).
- **How builders integrate:** the standards above work from any stack; a thin
  TypeScript SDK (`@polynet/sdk`) wraps the common calls, extracted from the
  first pilot rather than designed up front; docs plus a Polynet skill or MCP
  tool let a builder wire it in one prompt, since most will build with AI.

## Build order

1. **Modality 2, with Distribution Engineer as the pilot.** Distribution
   Engineer has its own WorkOS login and Stripe code but no users, so Polynet
   becomes its only gate. It already gates every action by plan through one
   access check (`crisBilling.access`), which is the seam to swap.
   - Polynet: plans with grants; connected-app registration; Sign in with
     Polynet; the access check and notifications.
   - Distribution Engineer: sign in with Polynet; access reads Polynet grants;
     its "Buy" goes through Polynet's checkout; its own checkout is switched
     off.
   - Then extract the SDK, then the agent bridge.
2. **Modality 3, minimum version:** the onboarding call and agent-plan billing.
3. **Later, on request:** modality-3 builders selling in their community.

## Build status

- **Slice 1 (built, staging):** tiers and grants. `convex/communityTiers.ts`.
  A membership holds one tier; each tier gives grants (`de:setter`), plus
  `community` for every member and `pod:<slug>` per pod they can enter, worked
  out when asked, never stored apart. Today's single price is the base tier
  `member`; Settings, the doorstep and checkout read only it, so existing
  communities are unchanged. A tier's price is its own price point (a new
  amount is a new price; members keep theirs). Builders manage Plans in
  community settings (design v1). Checkout accepts a tier key; buying a tier
  from an app is slice 3.
- **Research (Nov 12):** Whop (OAuth 2.1 + PKCE, server `checkAccess`),
  Patreon (OAuth, gate on entitled tiers; don't trust tier data in webhooks),
  Clerk and Outseta (plan in the token: fast but stale until expiry), Stripe
  Entitlements and Polar (features/benefits on products). Decisions: grants
  never in the sign-in token (the access check is the authority); thin
  webhooks ("changed, re-read"); per-app user IDs bound to the app's
  registration; grants computed, not stored.
- **Slice 2a (built, staging):** connected apps (`convex/connectedApps.ts`,
  `convex/httpConnectedApps.ts`). A builder connects their app in Manage →
  Your app (up to three per community): an app id, a secret kept only as a
  hash and shown once, an optional webhook address (public https only). The
  app calls `GET /apps/v1/access?email=` on the Convex site with
  `Authorization: Bearer <secret>` and gets `{ allowed, tier, grants }` for a
  verified email (the same plain "no" for unknown, unverified and non-members).
  Wherever access may change (joining, a payment change, leaving, removal, a
  pod grant: `convex/connectedAppNotify.ts`), each app with a webhook gets a
  thin `access.changed` (Standard Webhooks signature, same id across retries,
  retried 1 min to 24 h) and asks again.
- **Next:** slice 2b (the app reports its own sales: app-owned grants, invite
  by verified email, no fee), slice 3 (buy and change tiers through Polynet
  from the app), slice 4 (Distribution Engineer live, both ways). Sign in with
  Polynet waits for a builder with no login of its own.

## Open questions

- Agent plan pricing (flat per community, or a base plus members served), which
  also unblocks the founder plan's paid half.
- Agency teams in Distribution Engineer: one workspace per buyer for now; seats
  later, as a grant detail.
- The member's home in this model ("your progress, your agent, your people")
  is a design conversation of its own.
