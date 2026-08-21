# Desktop shell completion — design QA

final result: passed

## Environment

- Staging URL: `https://polynet-staging.vercel.app/c/polynet/chat`
- Verified build: `ddc9910d0d3ebd50f73ad0414c26bf871ab575b4`
- Authenticated Chrome viewport: `1171 × 763` captured pixels; live CSS viewport `1752 × 1140`; device pixel ratio `1`.
- Themes exercised: Dark, Light, and Cosmic.
- Routes and states exercised: default Context, Memory, Thread, member Profile, and global Settings.

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
- Narrow behavior remains container-owned: the `680px` community-chat contract collapses the drawer to `position: absolute; inset: 0; z-index: 16`; the contract proof passed against the staged source.
- Browser console after all interactions: no warnings or errors; only successful Convex health probes.
- Theme selection was restored to Dark after verification.

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

## Intentional differences from the supplied captures

- Live post/member data and scroll position differ from the screenshots.
- The captured browser width differs, so the fluid main column is proportionally narrower while the context drawer remains within its canonical `292–340px` clamp.
- No new typography, images, routes, state, or theme-specific component forks were introduced.
