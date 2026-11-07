# Builder modalities: one door, three kinds of builder (v0)

Status: agreed with Neil on 2026-11-07 as product direction. Nothing here is
built yet beyond today's community checkout; the build order is at the end.

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

## Open questions

- Agent plan pricing (flat per community, or a base plus members served), which
  also unblocks the founder plan's paid half.
- Agency teams in Distribution Engineer: one workspace per buyer for now; seats
  later, as a grant detail.
- The member's home in this model ("your progress, your agent, your people")
  is a design conversation of its own.
