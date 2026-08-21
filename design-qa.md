# Desktop shell + community rail — design QA

final result: passed

## Environment

- Staging URL: `https://polynet-staging.vercel.app/c/polynet/chat`
- Verified build: `f3ef016a92db26e4b634e79bbb746d6c53e531d6`
- Authenticated Chrome evidence: prior shell captures at `1171 × 763`; current rail capture and CSS viewport at `1752 × 1223`; device pixel ratio `1`.
- Themes exercised: Dark, Light, and Cosmic.
- Routes and states exercised: default Context, Memory, Thread, member Profile, and global Settings.

## Community rail placement comparison

- Source visual truth: `/var/folders/lz/8qz9l_5n1fqgg0v6wp4ydmsm0000gn/T/TemporaryItems/NSIRD_screencaptureui_LrIAnI/Screenshot 2026-08-21 at 6.37.33 PM.png`
- Browser-rendered implementation: `/Users/neilmcdevitt/.codex/visualizations/2026/08/21/polynet-rail-create-placement-qa/02-short-list-dark-full.png`
- Source pixels: `397 × 1215` focused crop.
- Implementation pixels and CSS viewport: `1752 × 1223` at device pixel ratio `1`.
- State: authenticated Polynet community chat, Dark theme, 16-community collection with no overflow.
- Normalization: compared the full-height rail region; the source is already a focused crop, while the implementation capture retains the surrounding workspace for state verification.
- Focused-region evidence: no additional crop was needed because the source itself isolates the complete rail and the live DOM measurements cover the relevant control geometry.

| Source issue | Corrected staged implementation |
| --- | --- |
| ![Create Community pinned too low](</var/folders/lz/8qz9l_5n1fqgg0v6wp4ydmsm0000gn/T/TemporaryItems/NSIRD_screencaptureui_LrIAnI/Screenshot 2026-08-21 at 6.37.33 PM.png>) | ![Create Community follows the final community](</Users/neilmcdevitt/.codex/visualizations/2026/08/21/polynet-rail-create-placement-qa/02-short-list-dark-full.png>) |

## Source-to-stage comparison artifact

The source captures and corresponding staged implementation captures are paired below. Content density and data differ because the staged community is live; comparison is normalized to the shell geometry, panel hierarchy, colors, borders, radii, and gutters.

| Surface | Source | Staged implementation |
| --- | --- | --- |
| Main + context gutter | ![Source context gutter](</var/folders/lz/8qz9l_5n1fqgg0v6wp4ydmsm0000gn/T/TemporaryItems/NSIRD_screencaptureui_DA36jo/Screenshot 2026-08-21 at 6.04.14 PM.png>) | ![Staged dark context](</Users/neilmcdevitt/.codex/visualizations/2026/08/21/polynet-shell-completion-qa/01-default-context.png>) |
| Settings framing | ![Source settings](</var/folders/lz/8qz9l_5n1fqgg0v6wp4ydmsm0000gn/T/TemporaryItems/NSIRD_screencaptureui_e1XXTr/Screenshot 2026-08-21 at 6.04.44 PM.png>) | ![Staged dark settings](</Users/neilmcdevitt/.codex/visualizations/2026/08/21/polynet-shell-completion-qa/05-settings-dark.png>) |
| Memory drawer | ![Source memory](</var/folders/lz/8qz9l_5n1fqgg0v6wp4ydmsm0000gn/T/TemporaryItems/NSIRD_screencaptureui_9VGHQW/Screenshot 2026-08-21 at 6.04.56 PM.png>) | ![Staged memory](</Users/neilmcdevitt/.codex/visualizations/2026/08/21/polynet-shell-completion-qa/02-memory.png>) |
| Thread drawer | ![Source thread](</var/folders/lz/8qz9l_5n1fqgg0v6wp4ydmsm0000gn/T/TemporaryItems/NSIRD_screencaptureui_izVMAw/Screenshot 2026-08-21 at 6.05.06 PM.png>) | ![Staged thread](</Users/neilmcdevitt/.codex/visualizations/2026/08/21/polynet-shell-completion-qa/03-thread.png>) |

Additional staged theme evidence:

- [Profile drawer](</Users/neilmcdevitt/.codex/visualizations/2026/08/21/polynet-shell-completion-qa/04-profile.png>)
- [Light settings](</Users/neilmcdevitt/.codex/visualizations/2026/08/21/polynet-shell-completion-qa/06-settings-light.png>) and [Light community](</Users/neilmcdevitt/.codex/visualizations/2026/08/21/polynet-shell-completion-qa/07-community-light.png>)
- [Cosmic settings](</Users/neilmcdevitt/.codex/visualizations/2026/08/21/polynet-shell-completion-qa/08-settings-cosmic.png>) and [Cosmic community](</Users/neilmcdevitt/.codex/visualizations/2026/08/21/polynet-shell-completion-qa/09-community-cosmic.png>)

## Findings

No P0, P1, or P2 visual or interaction findings remain in this slice.

## Measured acceptance evidence

- Canonical desktop shell gutter: `8px` in community and Settings.
- App canvas correctly paints the structural gap:
  - Dark: `rgb(17, 17, 19)`.
  - Light: `rgb(228, 228, 224)`.
  - Cosmic: `rgb(2, 8, 18)`.
- Main, Context, Memory, Thread, and Profile surfaces: independent full borders and `16px` radii.
- Settings navigation and content: independent full borders and `16px` radii on a transparent layout wrapper.
- Representative Context geometry at the captured desktop width: main `539px`, gutter `8px`, context `292px`.
- Memory, Thread, and Profile all use the same canonical drawer projection rather than surface-specific shell CSS.
- Create Community now follows the final community when the collection fits: 16 communities, a content-sized `786px` list, and a `37px` last-community-to-button interval including the existing endpoint padding and divider.
- Settings remains independently anchored to the bottom; the measured Create-to-Settings separation is `231px`, proving the former no longer belongs to the fixed footer.
- The community collection alone retains `overflow-y: auto` and `min-height: 0`; `flex: 0 1 auto` keeps it intrinsic until constrained, then allows it to shrink into the existing scroller.
- The Create Community button still opens and closes the canonical Builder offer successfully.
- Narrow behavior remains container-owned: the `680px` community-chat contract collapses the drawer to `position: absolute; inset: 0; z-index: 16`; the contract proof passed against the staged source.
- Browser console after all interactions: no warnings or errors; only successful Convex health probes.
- Theme selection was restored to the user's prior Light setting after verification.

## Required fidelity surfaces

- Fonts and typography: unchanged; no regression observed.
- Spacing and layout rhythm: passed. Structural gaps now reveal the app canvas rather than the panel surface.
- Colors and visual tokens: passed across Dark, Light, and Cosmic using existing canonical theme tokens.
- Image quality and asset fidelity: unchanged.
- Copy and content: unchanged.
- Interaction ownership: unchanged. Existing Context, Memory, Thread, Profile, and Settings triggers continue to own state.

## Verification

- `npm run check:app-shell-decomposition-contract`
- `npm run check:community-interaction-projection-ui-proof`
- `npm run check:community-polynet-tab-ui-proof`
- `npm run check:app-theme-contract-proof`
- `npm run build`
- Authenticated staging interaction and screenshot pass in Chrome.

## Comparison history

- Earlier P1: Create Community was placed in the fixed rail footer, leaving a large dead zone below a non-overflowing community list.
- Fix: moved Create Community and its divider after the canonical community-list element inside the main rail flow; Settings remains the only footer action.
- Post-fix evidence: the staged Dark capture shows Create immediately following the last community, the Builder offer interaction works, and the shell contract still requires community-only scrolling under constraint.

## Intentional differences from the supplied captures

- Live post/member data and scroll position differ from the screenshots.
- The captured browser width differs, so the fluid main column is proportionally narrower while the context drawer remains within its canonical `292–340px` clamp.
- No new typography, images, routes, state, or theme-specific component forks were introduced.
