# Community shell reference cleanup — design QA

final result: passed

## Comparison target

- Source visual truth: `/Users/neilmcdevitt/Desktop/ChatGPT Image Aug 20, 2026, 04_09_20 PM.png`
- Source pixels: `1448 x 1086`
- Browser-rendered implementation: `/Users/neilmcdevitt/.codex/visualizations/2026/08/20/01a020dc-2c0a-70b2-bdd6-d7d3440385b9/polynet-shell-cleanup-audit/06-final-live-staging.png`
- Implementation pixels: `1171 x 763`
- CSS viewport: `1171 x 763`
- Device scale factor: `2`; the browser screenshot API emitted CSS-pixel dimensions.
- State: authenticated desktop `/c/polynet/chat`, dark theme, populated Polynet community.
- Staging build: `909d03d477a61f81230df2b2e49c33eb0d71b4b7`
- Density normalization: the full-view reference was scaled proportionally to the implementation height before comparison because the supplied source and live browser capture use different dimensions.

## Full-view comparison evidence

- `/Users/neilmcdevitt/.codex/visualizations/2026/08/20/01a020dc-2c0a-70b2-bdd6-d7d3440385b9/polynet-shell-cleanup-audit/07-final-full-comparison.png`
- The global rail, community world, conversation, and context rail retain the reference's independent framed-column composition.
- Major proportions, navy material hierarchy, magenta interaction language, border strength, and overall density are aligned closely enough that no P0, P1, or P2 mismatch remains.

## Focused comparison evidence

- `/Users/neilmcdevitt/.codex/visualizations/2026/08/20/01a020dc-2c0a-70b2-bdd6-d7d3440385b9/polynet-shell-cleanup-audit/08-final-hero-comparison.png`
- The canonical community avatar, name, and settings action now sit over one edge-to-edge banner.
- The implementation intentionally omits the source's descriptive and CTA copy at the user's direction.
- Circular community rail identities and the narrow magenta active indicator now match the quieter reference grammar.

## Comparison history

### Earlier P1 findings

- Community identity and banner rendered as two stacked blocks.
- Funnel one-liner leaked into the in-product banner.
- Neutral charcoal surfaces missed the reference's deep navy material system.
- Selected channel used a large gray pill instead of the narrow magenta accent.

### Fixes and post-fix evidence

- Integrated identity over the banner and removed banner copy. Live computed evidence: banner `242 x 188`, identity surface `rgba(2, 8, 18, 0.22)`, and no `.community-nav-banner-copy` node.
- Scoped navy, warm-white, blue-gray stroke, and magenta tokens to the desktop community shell.
- Replaced the selected-channel treatment with `rgba(112, 39, 72, 0.34)` and a `3px` inset `#f54d7d` edge.
- Tightened the rail, navigation controls, channel header, pinned region, memory preview, and member rows.
- Changed desktop community identities to circular frames with the same magenta active edge.
- Post-fix evidence is the live staging capture and normalized comparisons above.

## Required fidelity surfaces

- Fonts and typography: the canonical IBM Plex family remains in use; hierarchy, weight, line height, wrapping, and metadata contrast are coherent with the reference. No actionable mismatch remains.
- Spacing and layout rhythm: shell insets, panel gaps, radii, hero height, channel density, context density, and composer footprint are balanced at the tested viewport.
- Colors and visual tokens: the shell now uses deep navy-black surfaces, cool low-contrast strokes, warm primary text, and restrained magenta active states.
- Image quality and asset fidelity: the real community avatar and authored banner render through the canonical framed-media component with a stable crop. No placeholder or code-drawn substitute was introduced.
- Copy and content: the in-product one-liner was removed as requested; dynamic community messages, counts, names, and roles remain truthful staging data.
- Icons: existing canonical icon controls remain aligned and legible. Reference-only controls without corresponding Polynet behavior were not added.

## Interaction and runtime checks

- `Explore memory` opened the canonical Community memory surface; `Back to community` restored the chat shell.
- `View all` opened `/c/polynet/members` and rendered the complete member-directory surface.
- Existing channel, Resources, Events, invite, settings, composer, and member-agent controls remained present in the live DOM.
- Browser console warnings/errors checked after the interactions: none.
- Contract proof, community interaction projection proof, and production web build passed.
- Repository-wide typecheck was not accepted as evidence because the isolated worktree lacked the root-only `stripe`, `resend`, and Node type packages; the web production build completed successfully.

## Intentional differences and P3 follow-up

- Staging uses its real banner art, community list, messages, counts, roles, and online state rather than the illustrative reference data.
- The decorative three-agent module was not added because Polynet does not currently expose three truthful active community agents in this surface.
- The existing settings action remains in the community hero instead of adding the reference's bell, consistent with the approved canonical settings direction.
