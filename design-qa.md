# Light Theme Selected-State Design QA

**Source visual truth**

- Previous Light screenshot: `/var/folders/lz/8qz9l_5n1fqgg0v6wp4ydmsm0000gn/T/TemporaryItems/NSIRD_screencaptureui_uvjwsx/Screenshot 2026-08-01 at 4.48.49 PM.png`
- Polynet Dark pattern reference: `/Users/neilmcdevitt/Desktop/Screenshot 2026-08-01 at 4.48.59 PM.png`
- Previous Light pixels: `2560 x 1440`; the browser occupies only the right side of the desktop capture.
- Polynet Dark reference pixels: `671 x 595`; this is already a focused desktop crop.

**Implementation evidence**

- Preview: `https://polynet-git-codex-neutral-light-theme-221987-neil-mcds-projects.vercel.app/c/polynet`
- Commit: `7b6776f0b2e4319f9d93c25f66cbdc3596f19b69`
- Screenshot: `/Users/neilmcdevitt/.codex/visualizations/2026/08/01/019fbe9e-d9da-7c30-a5c6-967e091101a4/light-theme-parity-staging-7b6776f0.png`
- Comparison board: `/Users/neilmcdevitt/.codex/visualizations/2026/08/01/019fbe9e-d9da-7c30-a5c6-967e091101a4/light-theme-parity-comparison-7b6776f0.png`
- Implementation pixels and CSS viewport: `1501 x 1224` at device scale factor `1`.
- State: Light theme, Polynet community, Chat selected, visitor gate dismissed for inspection.
- Computed selected surface: `color-mix(in srgb, #2f55ff 16%, #fff 84%)`, resolving to `color(srgb 0.86949 0.893333 1)`.
- Computed selected edge: `rgb(47, 85, 255)`.
- Computed selected foreground: `rgb(23, 23, 25)`.

The captures were not density-normalized for literal pixel matching because the source is a full Retina desktop capture with unrelated Codex and browser chrome, while the implementation is a browser-viewport capture with different community content. The comparison is limited to the selected-state grammar and surrounding Light material; no layout fidelity claim is based on those differing outer frames.

**Full-view comparison evidence**

- The implementation preserves the Light paper canvas, gray navigation panel, ink typography, card treatment, spacing, radii, imagery, and application layout.
- The selected Chat row is the only intended visual change: its former neutral gray fill is now an intelligence-blue wash while retaining the blue edge and dark readable foreground.
- The Polynet Dark reference still uses the original accent-wash plus accent-edge formula. The dark-theme selectors and tokens were not edited.

**Focused region comparison evidence**

- Previous Light: selected Chat reads primarily as neutral gray with a blue outline.
- Polynet Dark reference: selected Chat communicates through both accent fill and accent edge.
- New Light: selected Chat now communicates through both a 16% intelligence-blue fill and the existing blue edge.
- The selected row remains `274.1875 x 34` CSS pixels in the inspected preview. Hovering AI Feed did not disturb the selected Chat state.

**Required fidelity surfaces**

- Fonts and typography: unchanged; family, weight, size, line height, wrapping, and hierarchy match the existing product implementation.
- Spacing and layout rhythm: unchanged; no component dimensions, padding, gaps, radii, shadows, or grid tracks changed.
- Colors and visual tokens: passed; Light selected state now follows the dark semantic pattern while retaining Light's blue identity and paper foundation.
- Image quality and asset fidelity: unchanged; no image, icon, avatar, logo, or media code changed.
- Copy and content: unchanged.

**Findings**

- No actionable P0, P1, or P2 visual differences remain for the selected-state slice.

**Comparison history**

1. Earlier finding: Light selected navigation used a fixed neutral surface (`#E9E9E6`), so selection depended mostly on a thin blue edge and did not match dark-theme state grammar.
2. Fix: replace only Light's selected-surface value with the dark formula, using Light's intelligence blue and white card surface.
3. Post-fix evidence: the preview computes a blue-tinted selected fill, blue edge, and dark foreground on Chat; the comparison board shows the restored semantic parity.

**Primary interactions and runtime health**

- Selected Light from Appearance.
- Navigated through Discover into Polynet without losing the Light theme.
- Dismissed the visitor gate to inspect the active Chat row.
- Verified the selected token and computed colors in the browser.
- Checked browser console warnings and errors: none.

**Follow-up polish**

- P3 evidence gap: the branch preview is a public visitor session, while the original Light screenshot is an authenticated member view. The active navigation component and computed theme state are visible and verified, but authenticated content parity should be rechecked if this slice advances toward production.

**Implementation checklist**

- [x] Preserve both dark themes.
- [x] Reuse the dark selected-state formula in Light.
- [x] Keep the Light accent blue, paper hierarchy, typography, and layout.
- [x] Pass theme contract, typecheck, build, release gate, and browser visual QA.

final result: passed
