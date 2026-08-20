# Community Shell V2 — Slice 1 Contract

Status: staging candidate. This slice is intentionally incomplete and must not
be described as the final global navigation or Settings architecture.

## Outcome

Authenticated desktop community destinations present one community world:
the permanent global community rail is absent, and the canonical community
identity row owns an explicit community switcher.

## Required behavior

- The switcher trigger contains the active community avatar, name, and chevron.
- The menu order is `Discover`, `Create`, then `My communities`.
- Desktop community switching uses the existing active-community controller and
  lands on the selected community's canonical Home route.
- Active-community and attention state use the existing rail projections.
- The community Settings gear stays visible and retains its current permission
  and routing behavior.
- Desktop Discover and global Settings temporarily retain the global rail.
- Mobile retains its current behavior while consuming the shared switcher menu
  implementation instead of maintaining a second community-list component.
- The right context panel, member agent, direct messages, community content,
  and all Convex contracts remain unchanged.

## Prohibited in this slice

- No Settings action in the new desktop switcher.
- No global/community Settings route unification.
- No Memory or Members navigation change.
- No right-panel deletion or auxiliary-pane system.
- No community drag reordering inside the switcher.
- No Convex, schema, generated API, billing, entitlement, or agent changes.

## Staging acceptance

- The exact tested feature commit is contained by the deployed staging commit.
- Staging `version.json` matches the deployed integration commit.
- The served bundle still targets `quick-porcupine-949`.
- Keyboard users can open the switcher, move with arrow/Home/End keys, dismiss
  with Escape, and recover focus at the trigger.
- Desktop community routes never render the global rail; global Settings and
  Discover continue to render it until the next accepted slice.
