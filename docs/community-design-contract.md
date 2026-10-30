# Community design contract

October 24, 2026. Proposal, built in the2hourclo/Polynet. Needs Neil's
approval before it becomes a promise Polynet keeps.

A founder, or their agent, customizes a community only through what this
contract lists. Polynet keeps all of it working across updates. Everything
else, such as class names, internal CSS variables and component structure,
stays Polynet's to change.

Code: `shared/communityDesignContract.ts`. `describeCommunityDesignContract()`
returns the whole vocabulary as JSON, for the CLI and for agents.

## What it lists

| Part | What a design can use | Defined in |
| --- | --- | --- |
| Theme | The colour, type, shape, density and course catalog tokens | `shared/communityTheme.ts`, [community-theme-v1.md](community-theme-v1.md) |
| Layout | Navigation position and tabs, page width, the chat page's presentation and aside blocks. Only Polynet systems that exist; owner tools are pinned | `shared/communityLayout.ts` |
| Surfaces | The parts of a community's area that the tokens reach: headings, cards, buttons, course catalog, images, the community area itself | `COMMUNITY_DESIGN_SURFACES` |
| Lesson elements | `button`, `checklist`, `quiz` and `form` blocks, and the button actions | `shared/communityLessonContract.ts` |
| Widgets | `polynet-embed` blocks and the messages a widget may send: `ready`, `resize`, `load`, `save` | `shared/communityEmbed.ts` |

Surfaces never name Polynet's classes to founders. Each surface records which
of Polynet's classes carry it today, so the styles in
`apps/web/src/styles/community-theme-hooks.css` and the components stay in step.

## Over the MCP

Each record has a draft only managers see and a published version members see:

| Record | Read | Save a draft | Publish |
| --- | --- | --- | --- |
| Theme | `/communities/<slug>/builder/theme.json` | `community.theme.save_draft` | `community.theme.publish` |
| Layout | `/communities/<slug>/builder/layout.json` | `community.layout.save_draft` | `community.layout.publish` |

Every save and publish sends the `draft_revision` it read and is refused if
the draft has moved since. `polynet pull`, `dev` and `publish` use these.

## Checked from both sides

- **A founder's design**, before it goes live: `polynet check` and the server
  validate the theme and lessons against the contract. Unknown tokens, blocks
  or options are errors with the file named, never dropped.
- **A Polynet change**, before it merges: `scripts/community_design_contract.test.ts`
  fails when a component loses a class a surface uses, when the hooks file
  styles a class no surface lists, or when Polynet's styles read a theme
  variable the compiler never sets. The message says which surface broke.

The next step adds rendered checks: every published community's theme
screenshotted on fixture lessons at phone and desktop width, in Polynet's CI.

## Long lessons

A lesson body is one page in sections (`shared/communityLessonSections.ts`).
Each `## ` heading starts a section; a section holds up to 20,000 characters
and a page up to 240,000. A body over these limits is refused whole with a
message naming the section, never cut off. Members read the whole lesson on
one page with a section list and resume; agents get the section list with
each read and read a section by `offset` and `limit`.
