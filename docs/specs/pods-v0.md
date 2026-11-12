# Pods (v0 spec)

Status: draft for Neil's review, 2026-11-12. Direction agreed in conversation
the same day; nothing here is built. Pods replace private channels as a
concept.

## What a pod is

A pod is a small group inside a community with **a purpose, a host and a
rhythm**, sold as a higher-touch tier: base access to the community at one
price, access to a pod for more per month. Members in a pod get more
one-on-one time with the hosts, a private room, private knowledge, and can
plug their own AI agents in to work together.

A pod has:

- **A name and purpose** ("Founders pod", "Launch in 30 days").
- **Hosts**: the builder, or people the builder assigns.
- **Seats**: a limit the builder sets (optional).
- **A price**: per month, on top of base membership (optional; a pod can be
  free or invite-only).
- **A rhythm**: usually a recurring pod call.
- **A room**: its own conversation.
- **Its own knowledge**, private to the pod.
- **Agents**: its members' own agents and, with the Agent plan, the
  community's guide.

**The builder decides how each pod works.** The default is open-ended and
monthly recurring. A member can be in several pods.

## Why not private channels

A list of private channels down the left column says nothing about what each
one is for, who it's for or what it costs, and it grows without limit. Pods
are one item in the left column, **Pods**, which opens a page (as Knowledge
does). Nothing private is ever listed in the left column.

## Who sees what

### The Pods page

| Viewer | Sees |
|---|---|
| **Builder and hosts** | Every pod as a card: members, seats filled, monthly revenue, next call, how active it has been. "New pod". |
| **A member in pods** | Their pods first; opening one goes inside. Then listed pods they could join. |
| **A member in no pod** | Listed pods from the outside only. |
| **A visitor** | Nothing. |

### Listed and hidden (the builder chooses per pod)

- **Listed** (default): members who aren't in it see its card from outside:
  name, what you get, hosts, price, seats left, and "Join" or "Ask to join".
  Never who is inside, what is said, or its knowledge.
- **Hidden**: only its members, its hosts and the builder know it exists.

### A pod's own page

One address per pod, `/c/:slug/pods/:pod`, for hosts to share anywhere. Who
opens it decides what it shows: someone in the pod goes into its room; a member
who isn't sees its outside page (listed pods only); the builder and its hosts
see that same outside page with Edit and a way in; anyone else gets "not
found", so a hidden pod never shows. The outside page has fixed sections,
filled from the pod and hidden when empty: name and purpose, **What you get**
(up to four short lines), hosts, price and seats, and one button (Join, Ask to
join, Join the waitlist, Full, or what the viewer already did). No page builder.

### Your membership

In the pod's right column: "You're in" (added by a host), "+$100/month · renews
Dec 12", "Leaving · access until Dec 12", or "Your last payment didn't go
through" (with the same email communities send). **Leave pod**: paying members
stop renewing and keep access to the end of the period; anyone else is out at
once. The builder and hosts see how each member is in: Paying, Leaving, Payment
problem, or Added by a host.

### Inside a pod

- **Middle**: the pod's conversation (the channel experience).
- **Right column**: who is in it (people and agents), the next pod call, each
  member's goal and progress, the pod's knowledge, and (with the Agent plan)
  the guide's catch-up for the pod.

## Pod knowledge

Two layers with a one-way wall:

- A pod **reads** the community's knowledge **and** its own.
- What is learned **inside** a pod stays in the pod: notes saved from its
  conversation, its calls and its agents' work never appear in the
  community's Knowledge, in the guide's answers outside the pod, in Home's
  moments, or in any summary a non-member can read.
- Readers of pod knowledge: its members, its hosts, the agents plugged into
  it, and the guide while it is working inside that pod.
- The only way out: a host **publishes** a pod note to the community, on
  purpose. Nothing leaves automatically.

## Money and access

Decided with Neil 2026-11-12, replacing "one plan that includes base
membership". The irreducible parts:

1. **A price**: one monthly number on the pod, charged **on top of** whatever
   the member pays for the community ("+$100/month on top of your
   membership"). The builder picks the number; Polynet never computes a
   difference, so members on different base prices are all correct.
2. **A subscription**: the member's payment for that pod, separate from their
   membership payment, on the builder's Stripe account with Polynet's 2.9%.
3. **A grant**: the pod room's existing access row
   (`communityChannelParticipants`). Payment writes and removes it, as a host
   does by hand. The access rule is unchanged: in the community, and on the
   pod's list.

Events:

- **Join**: Join → Stripe → Stripe's verified notice adds the row. The return
  page grants nothing.
- **Renewal**: nothing changes.
- **Leave the pod**: stops renewing; access lasts to the end of the period.
- **Failed payment**: Stripe retries; access stays until Stripe ends the
  subscription.
- **Refund or dispute**: that pod only loses access, and its subscription
  stops. A won dispute doesn't reopen it; the member can join again.
- **Can't reach the pod any more** (left or removed from the community,
  taken off the pod by a host, the pod closed, or the community archived):
  access and billing stop at once (an hourly pass is the safety net),
  refunding in full only a payment that never let them in.
- **Price change**: a new price for new joins; existing members keep theirs.

Each pod picks one gate: invite only (hosts add people), ask to join (a host
approves), or paid. A member can be in any number of paid pods. Seats are
checked when checkout starts; a full paid pod shows "Full" and hosts add
people by hand.

Not built: plan switching, proration, combined prices, approve-then-pay, seat
holds during checkout, a paid waitlist, a combined community-plus-pod
checkout.

Code shape: the price lives on the pod record; `communityPodPayments` holds
each pod checkout and, once Stripe confirms it, its subscription, apart from
`checkoutSessions` and `communitySubscriptions` (whose code assumes one per
membership); one branch in the Stripe notice handler routes anything carrying
`pod_payment_id` to the pod path. Live community billing is untouched.

## Agents in pods

- **Bring your own agent.** A member connects their own AI agent to a pod
  through the Polynet MCP. It appears in the pod as "Maya's agent", always
  labelled as an agent and as whose it is.
- **It acts for its member only**, and **speaks only when told to**: by its
  owner, or when someone in the pod asks it directly.
- **It sees that pod only**: the pod's conversation and knowledge, and the
  community's shared knowledge. Never other pods, DMs, or other members'
  sessions.
- **The member pays for their own agent** (it is their AI); it costs the
  builder nothing.
- **The community's guide** is in a pod only when the builder has the Agent
  plan and has added it to that pod. There it facilitates: gathers updates,
  notices who is stuck, drafts the call agenda, writes the pod's catch-up.
  What it learns there stays pod knowledge.
- **Hosts stay in control**: they can mute or remove any agent, and see which
  agents are connected.
- **Later, not in v0: the agents' table.** A place in a pod where every
  member's agent works one shared problem together (each brings its member's
  context; the result comes back to the pod). The design leaves room for it:
  agents are first-class pod participants with their own identity, scope and
  rate limits.

## How it sits on what exists

- **The room** is today's invite-only channel (`communityChannels` with
  restricted access, grants in `communityChannelParticipants`); its access
  checks, privacy rules and the "agent sees only rooms it was added to" rule
  carry over (`community-private-channels-v1.md`).
- **New**: a pod record (purpose, hosts, seats, listed or hidden, price point,
  rhythm) pointing at its room; pod-scoped notes; pod calls (events visible to
  the pod only); agent participants.
- **Existing private channels** become hidden pods with no price, so nothing
  anyone has today disappears. Creating a "private channel" is replaced by
  "New pod".
- **Lessons from the earlier outside attempt** (PR #290): the community agent
  must not read pod calls or pod content unless it is in that pod; changing a
  pod's audience must never fire automations for everyone; "who is in this
  pod" has one reader that goes through the access lens.

## Slices (each ships to staging, then Neil's acceptance)

1. **The Pods page and pods as groups.** The pod record, "Pods" in the left
   column, the builder's view of all pods, a member's pods, inside a pod (room
   + who's in it). Hosts add people by hand. Private channels become hidden
   pods and leave the left column.
2. **Listed pods and paid access.** 2a (built): listed or hidden, the outside
   view, ask to join, seats and waitlist, hosts. 2b (built): a pod price and
   Join through Stripe. 2c (built): refunds, disputes and the sweep that
   stops billing for pods someone can't reach.
3. **Pod knowledge and pod calls.** Pod-scoped notes with the one-way wall and
   "publish to community"; pod-only events; with the Agent plan, the guide in
   a pod and its catch-up (uses the gateway's summaries).
4. **Members' own agents.** Connect an agent to a pod, labelled, pod-scoped,
   speaks when told to, host controls.
5. **Later: the agents' table** (agent-to-agent work on one shared problem).

## Open questions

1. Seats: a default limit (say 12), or none unless the builder sets one?
2. "Ask to join" for listed pods with no price: does the host approve each
   person, or is joining instant?
3. Cohorts with an end date (the builder's choice per pod): in v0, or after
   open-ended pods prove themselves?
4. Should a pod's hosts be able to see its revenue, or only the builder?

## Not in v0

Pods on community sites, pod-level
automations, and the agents' table.
