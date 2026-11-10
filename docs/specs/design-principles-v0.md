# Design principles (v0)

Status: agreed with Neil on 2026-11-07. These judge every Polynet screen, for
members, builders and connected apps. Written from the product's goal, not from
today's UI. Companion to [builder-modalities-v0.md](builder-modalities-v0.md).
The look and the screens that apply these principles are specified in
[design-system-v1.md](design-system-v1.md).

## The concept: one path, one guide, your people

Polynet sells an outcome, delivered through software, a guide and people. It
should not feel like a forum, a dashboard or a chat app. It should feel like
walking into a place where someone knows you, knows where you are, and has your
next step ready, with your people around you.

## The five philosophies, and the job each does

1. **Jobs to be done: the direction.** Every screen exists to move a member (or
   builder) toward their outcome. Each screen answers "where am I?" and "what's
   next?" before anything else. Progress is the hero, not the feed.
2. **Object-oriented UX: the structure.** Design around the real things in the
   product, not features: member, agent, journey, step, plan, people, community.
   This is the same ontology the agent reasons about, so the UI and the agent
   share one model of the world. A thing looks and behaves the same wherever it
   appears.
3. **Calm technology: the temperament.** Inform without demanding attention.
   Quiet by default; the agent speaks when it is genuinely useful. No badge
   spam, no urgency theatre.
4. **Dieter Rams, "less, but better": the discipline.** Every element earns its
   place. When in doubt, remove it. This is what makes progressive disclosure
   work: there is less to disclose.
5. **Progressive disclosure: the mechanics.** The essential first, depth on
   demand. One primary action per screen.

## What that means in practice

- **The agent is a colleague, not a chat tab.** It shows up where the work is,
  does things, shows what it did, and asks for decisions as clear cards
  (approve, change, skip). Chat is one way to talk to it, not the whole product.
- **People are visible.** Belonging needs faces: who is here now, who is on the
  same step, who just made progress. A community should feel inhabited.
- **One door, one feeling.** The community and the builder's app feel like one
  product: identity, the agent and progress follow the member across both. The
  builder's brand leads; Polynet recedes to craft and a small "powered by".
- **The builder's brand, Polynet's craft.** Every community can look like
  itself; Polynet supplies the quality floor (spacing, type, motion,
  accessibility) so nothing looks cheap even when the builder isn't a designer.
- **Two speeds.** The member side is warm and human. The builder's Studio is
  precise and operational, like a cockpit: dense where it must be, fast,
  keyboard-friendly.

## Look and feel

- Premium, calm, alive.
- Dark-first and near-monochrome (it matches the white-on-black mark), with one
  accent colour from each community's own brand.
- Strong type, few words, generous space.
- Motion that signals life: the agent working and people present are felt
  through subtle motion, not spinners.
- Real faces and real work; never stock illustration or confetti.

**Avoid:** neutral SaaS templates, sidebars with many items, notification badges
everywhere, dashboards of many widgets, and a chat box as the whole experience.

## The key screens

- **The door (joining):** one decision per screen; payment first; one tap and
  you're in.
- **Member home, "Today":** three zones: your next step and progress; what your
  agent did and what it needs from you; your people right now.
- **Inside a builder's app:** Polynet as a light companion layer; the agent and
  the community one tap away, with the context of what you are doing.
- **Builder Studio:** opens on the daily brief (what happened, who's stuck,
  decisions waiting), then the journey board of members moving through stages.
  Settings stay tucked away.

## Next

Two or three visual directions of "Today" and the door, to react to; the chosen
direction becomes Polynet's design system, inherited by every community and
connected app.
