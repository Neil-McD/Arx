# Design system (v1): the default app

Status: direction agreed with Neil on 2026-11-09, from a clickable mock. Not
built in the product yet. The build order is in
[design-system-v1-implementation-plan.md](design-system-v1-implementation-plan.md).

This is the spec sheet for how the Polynet app looks and behaves by default, for
members and for hosts, in dark and in light. It applies
[design-principles-v0.md](design-principles-v0.md); where the two disagree, the
principles win and this document is wrong.

The exact values live in the reference file,
[design-system-v1-reference.html](design-system-v1-reference.html). Open it in a
browser: the account row (bottom-left) switches member and host, and dark and
light. When this document and the reference disagree, the reference is right
about values and this document is right about rules.

## 1. What this is, in one paragraph

A calm, precise instrument with a human voice inside it. One left column, a main
area, and a right panel for context. The community's agent is the first thing a
member meets (Home). The platform brings no imagery or colour of its own: the
only picture on screen is the community's banner, and colour is used only to
mean something.

## 2. Rules

These are the decisions. Everything else follows from them.

1. **The platform has no imagery of its own.** No backgrounds, illustrations or
   themes. The only image is the community's banner.
2. **Colour is meaning.** Four colours, four meanings, nothing decorative:

   | Colour | Means | Used for |
   |---|---|---|
   | Blue | You can act | Primary buttons, links, mentions, "live" markers, the current step |
   | Purple | The agent | Its mark, its name tag, its glow, what it learned |
   | Red | Something is wrong | Failed payments, errors, destructive actions on hover |
   | Ink (white in dark, near-black in light) | Text and unread | All text, the unread dot |

   A community's own colour appears only behind its logo when it has no image.
3. **Two voices.** The agent speaks in a serif (Newsreader). The interface
   speaks in a sans (Geist). The agent's text is the same visual size as a
   person's; only the typeface differs.
4. **One card per screen:** the thing that needs you. Everything else is rows,
   space and hairlines.
5. **Light belongs to the agent.** The only glow is a soft purple one behind the
   agent's mark where it speaks. No background gradients.
6. **Only the agent moves on its own** (a slow five-second breath). Everything
   else moves only in response to the person: 160 ms, ease-out. Nothing bounces,
   spins or shimmers.
7. **One navigation system.** Every place in a community is a row in the left
   column. No top tabs. Nothing in the frame relabels itself or disappears.
8. **Show only what is used.** A community that has no events has no Events row.
9. **Say each thing once per screen.**
10. **A host sees the same pages as a member, with more controls.** There is no
    separate admin app for daily work.
11. **Three things make a community its own:** banner, logo, and name (plus one
    colour, used only behind the logo when there is no image). Nothing else is
    restylable in the default app.

## 3. Tokens

Dark is the default. Light follows the device setting, with a switch in the
account menu.

### Colour

| Token | Dark | Light |
|---|---|---|
| Ground | `#030406` | `#F6F7F9` |
| Ink | `#EEF0F4` | `#0D1117` |
| Ink, body text in chat | 88% | 92% |
| Ink, secondary | 66% | 72% |
| Ink, labels and times | 52% | 62% |
| Hairline | ink at 7% | ink at 8% |
| Hairline, strong (borders) | ink at 12% | ink at 14% |
| Surface, hover | ink at 3.5% | ink at 3.5% |
| Surface, selected | ink at 6% | ink at 6% |
| Surface, raised | ink at 9% | ink at 9% |
| The card | faint top-lit glass | `#FFFFFF`, soft shadow |
| Pop-ups (menus, palette) | `rgba(13,15,20,.94)` | `#FFFFFF`, soft shadow |
| Blue, marks and dots | `#1D9BF0` | `#1583DD` |
| Blue, text | `#6CBEF7` | `#0A66C2` |
| Blue, primary button | `#1077D2` to `#0B69C4` | same |
| Purple, mark | `#A78BFA` | `#7C5CF0` |
| Purple, text | `#C4B2FC` | `#5B3FD0` |
| Red | `#FF8A7A` | `#BE3527` |

Percentages are opacity of Ink over Ground.

### Contrast (measured, WCAG ratio; 4.5 is the minimum for normal text)

| Text | Dark | Light |
|---|---|---|
| Ink | 18.0 | 17.7 |
| Chat body | 13.8 | 14.6 |
| Secondary | 7.8 | 7.4 |
| Labels and times | 5.1 | 5.2 |
| White on the primary button | 4.6 to 5.5 | 4.6 to 5.5 |
| Blue text | 10.1 | 5.3 |
| Purple text | 10.9 | 6.4 |
| Red text | 9.0 | 5.3 |

### Type

| Use | Face | Size | Weight |
|---|---|---|---|
| The agent's greeting | Newsreader | 40 | 300 dark, 350 light |
| The agent's opening line on a page | Newsreader | 24 | 300 dark, 350 light |
| The agent's text everywhere else | Newsreader | 17 | 400 |
| Titles (the card, a note, a person) | Geist | 20 | 600 |
| Figures | Geist | 24 | 600 |
| Row titles, chat body | Geist | 15 | 500, 400 |
| Navigation, buttons | Geist | 14 | 450 to 550 |
| Secondary lines | Geist | 13 | 400 |
| Labels, times, hints | Geist | 12 | 500 |

Numbers are tabular. Labels are sentence case; no uppercase, no monospace.

### Shape and space

- Radius: 8 for rows, 9 for buttons, 12 for list rows and menus, 14 for the card
  and composers. Avatars are round.
- Grid: 4 px. Navigation rows are 32 tall; buttons 36 (small 30); composers 52.
- Columns at 1440 wide: left 264, right 328 (400 for an open conversation), main
  fills the rest with 56 of padding. One content width per page.
- Fits 1440 by 900 without scrolling on Home.

## 4. The frame

**Left column, top to bottom**

1. The banner frame: the community's image, with its logo and name over a dark
   fade at the bottom. Clicking it opens search and the community switcher. With
   no banner, this is a single row with the logo and name.
2. Home, Inbox.
3. Channels.
4. Community: Knowledge, Events, Members (and Pods, where used).
5. For a host: Your guide, Manage.
6. The account row. Clicking it opens a menu: light or dark, view as a member
   (host only), profile and settings, sign out.

**Top bar:** the page's name on the left (nothing on Home), search on the right.
On every page but Home, one faint blue hairline sits under it.

**Right panel:** context for the page, never navigation.

**Search (Cmd+K):** go to a place, ask the agent, switch community.

## 5. Pages

Each page has one job.

| Page | Its job | The agent's part | A host also gets |
|---|---|---|---|
| Home | What needs me, and what happened | Greets, shows the one thing, answers questions | A brief about the community, four figures, decisions waiting |
| Inbox | Messages and mentions, across communities | Says which need a reply | Drafts waiting for approval |
| A channel | Talk | Speaks when mentioned or useful; right panel has a catch-up | Pin and remove on a message; add a channel |
| A thread | Reply without losing your place | None | |
| Knowledge | What the community has learned | Wrote the notes; answers about a note | A review queue: approve, edit, dismiss; who can read a note |
| Events | What's on; join when live | Recaps past calls into Knowledge | New event |
| Members | Find the right person | Suggests who to meet, with a reason | Join requests; plan, joined, last active; payment state |
| Your guide (host) | What the agent may do | States its own limits | The whole page |
| Manage (host) | The back office | None | Branding, the door, plans, payouts, analytics, roles |

**Home has three states:** something needs you (the card is shown), a quiet day
(no card, a short list), and day one (three small steps). A host has the same
three, the third being a brand-new community.

## 6. Components

- **Row.** Icon, label, optional hint on the right. Hover is a faint surface;
  selected is a stronger one. Unread is a small ink dot and bolder text.
- **The card.** Label and progress on top, a title, the agent's sentence in
  serif, then at most three actions: one primary (blue), one outlined, one text.
- **List row.** A kind or avatar on the left, a title and one secondary line, an
  action or arrow on the right. Hairline between rows; none on hover.
- **Buttons.** Primary is blue with white text. Secondary is outlined. Text
  buttons have no border. Destructive actions look like secondary buttons and
  turn red on hover.
- **Tags.** Small outlined labels for roles (host, moderator). The agent's tag
  is purple. A problem tag is red.
- **Composer.** One per page, at the bottom. Focus ring is purple when talking
  to the agent and blue in a channel.
- **Avatars.** Photos where there are any; otherwise an initial on a muted disc.
  The agent's is its mark on a purple-tinted disc.
- **The banner frame.** 112 tall. The image is cropped to fill; a dark fade sits
  under the name in both modes.
- **The network.** Knowledge is drawn as dots and lines in ink. New notes have a
  purple halo. This is the only ornament.

## 7. Words

- The agent says "I". It is plain, warm and brief. It never sells.
- It says what it did and what it did not do ("I've answered nothing for you").
- Buttons are verbs: "Approve and send", "Read it first".
- Sentence case everywhere.

## 8. What is not designed yet

Do not invent these during the build; ask.

- Mobile.
- Pods, in either view.
- Manage, beyond Branding.
- Locked and empty states: a payment on hold as the member sees it, a lapsed
  membership, a note the plan does not include, a community with nothing in it.
- A visitor's view (the door).
- Keyboard focus rings.
- Windows narrower than about 1180 px (the right panel should collapse).
- How real profile photos sit next to the muted avatars.
- Presence ("here now") as a mark on an avatar.

## 9. Decided with Neil on 2026-11-10

1. **"Guide", not "agent", in the interface.** The community's agent introduces
   itself as "{community}, your guide". The code and the docs keep "agent".
2. **Numerals in the guide's voice:** "3 people joined", not "three".
3. **Suggestion chips** above the composer show only when the composer is
   focused, or on a quiet day.

## 10. Reference and source

- Reference file (member and host, dark and light, every page built so far):
  [design-system-v1-reference.html](design-system-v1-reference.html).
- The sample communities, names and messages in it are invented.
- The design canvas with every earlier direction is a private artifact of
  Neil's; the working source is kept outside the repository.
