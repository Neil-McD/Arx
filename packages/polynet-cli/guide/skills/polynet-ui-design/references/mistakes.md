# The mistake ledger

Every UI mistake a founder or a review has caught, the root cause behind it,
and the gate that now catches it. `polynet review` names these checks in its
report. Read the ledger before you design and again before you present.

When a founder points out a new mistake, add it here in the same turn:
what happened, the rule, and the check. If a machine can see it, add the
check to `ui-audit.mjs` too; if only a person can, add it to the reviewer's
questions (`reviewer.md`). A mistake caught twice means the gate is missing.

## Root causes

Most mistakes so far trace to five causes. Fix the cause, not the instance.

| Cause | What it looks like | The gate |
| --- | --- | --- |
| **A. The look didn't start from the community** | template colours, generic blue, a font chosen because it was first | Brand first (skill step 1); `off-palette`, `brand-avoid` |
| **B. No system, so values drifted** | colours that don't match between pages, many sizes, radii and borders, controls of different heights | Set the system before styling (skill step 8); `off-palette`, `drift`, `control-family` |
| **C. More was added than removed** | badges, chips, dividers, emoji, stacked bylines, heavy cards | The remove-before-you-add pass; `heavy-cards`, `text-levels`, `emoji-chrome`, reviewer |
| **D. Only one screen, one width, one state was looked at** | phone overflow, squeezed columns, overlays left open, untitled posts breaking rhythm | Every page at 390, 1280 and 1440, with edge-case content; `overflow`, `overlap`, `squeezed-main` |
| **E. Done was declared from the code** | edits shipped one by one, unseen | `polynet review` must pass and a fresh reviewer must say PASS before presenting or publishing |

## Entries

| # | Mistake | Rule | Check |
| --- | --- | --- | --- |
| 1 | A template brought its own blue, not the community's brand ("doesn't feel like my world"). | A template decides layout only. Colours and fonts come from the community's saved brand, then its theme. | `off-palette`, `brand-avoid` |
| 2 | Sketch borders and a hard shadow went onto feed cards, so every card shouted. | Repeated cards stay flat with a hairline; the theme only sets their corners. | `heavy-cards` |
| 3 | A display face was used for post titles. | Display faces are for page headings, never for repeated item titles. | `display-font-on-items` |
| 4 | Settings colours didn't match the community. | Everything inside the community uses its theme colours, or mixes of them. | `off-palette` |
| 5 | Byline stacked and the category in its own pill: three elements where one quiet line will do. | Metadata is one muted line. | reviewer |
| 6 | Title and preview had the same colour and weight. | At most three text levels per component; the title differs from the body. | `text-levels`, reviewer |
| 7 | Previews weren't clamped and rendered headings and lists inside cards. | Previews are two lines of plain text. | `unclamped-preview`, `clipped-text` |
| 8 | Post footer used emoji chips and a divider, without counts or commenter faces. | Compare each component side by side with the best product in its category. | `emoji-chrome`, reviewer (reference pairs) |
| 9 | A full chat box sat on top of the feed and competed with posts. | Inputs are lighter than content and start collapsed on feeds. | reviewer |
| 10 | The opened composer was 187px wide in a 720px card. | Inputs fill their container. | `narrow-input` |
| 11 | Opening a post squeezed the feed to 260px. | The main column stays 480px or wider on desktop; details open as dialogs on page layouts. | `squeezed-main` |
| 12 | A drawer stayed open after switching tabs. | Leaving a page closes its overlays. | reviewer (state walk) |
| 13 | A drawer header read "thread" in lowercase mono. | No internal or placeholder labels. | `internal-label`, `filler-copy` |
| 14 | Members was a stretched sidebar roster, one card per row. | A page view is designed for the page. | `single-column-grid` |
| 15 | Owner tools sat in the member navigation. | Member navigation shows member destinations only. | layout contract (owner tools pinned), reviewer |
| 16 | At 390px the course grid kept 2 columns and the switcher collided with the title. | Every page is checked at phone width; theme rules never override phone rules. | `overflow`, `overlap` |
| 17 | A one-line untitled post broke the feed's rhythm. | Edge cases are part of the design: untitled, very long, image-only, agent posts. | `filler-copy`, reviewer (edge-case content) |
| 18 | Changes went out edit by edit without looking at the result. | Nothing is done until every page at phone and desktop passes review. | `polynet review` gate on `publish` |
| 19 | Edits worked but didn't look clean or premium. | Clean in one shot: the system first, then the cleanliness pass, before anyone sees it. | `drift`, `control-family`, reviewer |
| 20 | Owner pages (Settings, Analytics) kept Polynet's colours inside a themed community. | Every page inside the community takes its theme's colours, owner pages included. Owner chrome stays neutral and uses the accent only for actions and selection (owner-screens.md). | `off-palette` on the `settings` and `analytics` screens |
| 21 | A dark community: the admin's name was set in the accent green on near-black, 4.0:1. The accent passed as a fill but not as text. | An accent used for text needs 4.5:1 on its background, not just 3:1. Pick an accent shade that passes as text, or keep it for fills. | `contrast` |
| 22 | A dark community: the memory graph drew cyan dots that aren't the community's colours, and showed the word "Error" under it. | Charts and graphs draw in the theme's colours; a failed widget shows a designed empty state, never a bare error. | `off-palette` (SVG fill and stroke), `error-state` |
| 23 | A dark community: courses without covers showed a grey book icon next to courses with real covers. | A catalog has one cover language: every course gets a cover, or none do. | reviewer |
| 24 | A dark community: the community name was typed over a banner logo that already says it. | Say the name once: the logo or the text, not both. | reviewer |
| 25 | A dark community on a phone: course cards ran off the right edge inside a clipping container, so the page didn't scroll and the overflow check stayed quiet. | Check what's cut off, not only what scrolls. | `cut-off` |
| 26 | A dark community on a phone: "New event" sat on top of the chat button. | Controls never overlap, however they're positioned. | `control-collision` |
| 27 | A dark community: page titles were the same size as the navigation. | A page title is a clear step above everything else on the page. | reviewer, `drift` |
| 28 | A course community's Knowledge page "feels very vibe coded": the theme's hand-drawn face and hard sketch shadow went onto every card, list row and back link, and the back link was set in mono. | A theme's character lives in one or two places (page titles, covers); repeated components keep calm, flat defaults in the text face. | `heavy-cards`, `display-font-on-items`, reviewer |
| 29 | A course community's Knowledge page: a lock reason was printed over every locked course's cover, and an empty header row left a dead gap above the catalog. | Status on a cover is a small icon; its words go in the card's meta line. A row with nothing in it isn't drawn. | `text-levels`, reviewer |
| 30 | A course community's Knowledge page (fresh review): the lesson view had two display headings ("Knowledge" and the lesson title) a hand apart, and on phones the open lesson list pushed the lesson below the fold. | One display heading per screen: the thing you're reading. On phones, content comes first and navigation folds. | reviewer |
| 31 | A dark community: secondary text was "gray on black, not white on black". The theme's muted and faint levels sat at 4.5 to 7:1 on near-black: they passed AA but read as grey. | On dark schemes, body text is near-white and secondary text stays light: the compiler lifts secondary to 15:1, muted to 12:1 and faint to 9:1 against the card surface, and body copy (post previews, descriptions, About text) uses the primary text colour, never secondary. | `grey-on-dark` |
| 32 | A dark community, caught a second time: after the first lift (13/10/7.5:1) the Classroom feed still read grey, because post previews and descriptions used the secondary colour and the floors were still visibly grey on near-black. | Body copy is primary text. On dark pages greys stay close to white: 9:1 at the very least. | `grey-on-dark` (now 9:1) |
| 33 | A dark Classroom community inside light Polynet: post bodies were dim and post titles invisible. Polynet's `--chat-*-text` colours were mixed at `:root` from Polynet's own text colour, so the community theme never reached them. | Any colour Polynet derives at `:root` from another colour must be redefined by the theme compiler too. Check a dark community with Polynet in light mode, and a light one with Polynet in dark mode. | `contrast`, reviewer (both Polynet modes) |

## What each automatic check means

| Check | Fails when | Usual fix |
| --- | --- | --- |
| `overflow` | the page scrolls sideways | let the named element wrap or shrink; check grids at 390px |
| `overlap` | two boxes in the same row cross | give the row room to wrap; stack on phones |
| `contrast` | text under 4.5:1 (3:1 large) | darken or lighten that text, or its background |
| `grey-on-dark` | small text on a near-black surface under 9:1 | use the theme's text levels, which the compiler lifts on dark schemes; never hand-mix a grey |
| `off-palette` | a colour isn't a theme or brand colour or a mix of two | use a theme token; if the brand truly needs it, add it to the brand |
| `brand-avoid` | a colour the brand rules out appears | replace it |
| `drift` | too many font sizes, weights, radii, border colours or shadows on one screen | collapse near-identical values onto the system |
| `control-family` | buttons and inputs come in more than three heights | one control height, one smaller one at most |
| `tap-target` | a control is under 24px (40px tall on phones warns) | add padding |
| `heavy-cards` | repeated cards have thick borders or hard shadows | hairline or nothing; let space separate |
| `text-levels` | a repeated card uses more than three text styles | title, body, meta |
| `unclamped-preview` | card previews render headings or lists | plain text, two lines |
| `display-font-on-items` | a display face inside repeated items | the text face for items |
| `narrow-input` | a text box is far narrower than its container | full width |
| `squeezed-main` | the main column is under 480px on desktop | open details as dialogs, or hide the aside |
| `single-column-grid` | cards one per row on a wide screen | let the grid fill the width |
| `internal-label` | a label looks like a code name | real words |
| `filler-copy` | lorem, "untitled", test data | real content |
| `emoji-chrome` | emoji as interface icons or labels | real icons, or none |
| `clipped-text` | text cut off with no ellipsis or clamp | clamp it on purpose, or give it room |
| `cut-off` | content runs past the screen's right edge, even inside a clipping box | let it wrap or shrink at phone width |
| `control-collision` | two controls overlap | move one, or let the row wrap |
| `error-state` | an error message shows where content should be | fix the cause, or design the empty state |
| `broken-image`, `console-error`, `load` | the page itself is broken | fix before judging the design |
