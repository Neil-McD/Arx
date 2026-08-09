# General Settings Design QA

## Evidence

- Source visual truth: `/var/folders/lz/8qz9l_5n1fqgg0v6wp4ydmsm0000gn/T/TemporaryItems/NSIRD_screencaptureui_wPrZ2T/Screenshot 2026-08-09 at 5.39.29 PM.png`
- Matched live baseline capture: `/tmp/polynet-general-settings-baseline-1201.png`
- Browser-rendered implementation: `/tmp/polynet-general-settings-polished-1201.png`
- Side-by-side comparison: `/tmp/polynet-general-settings-comparison-1201.png`
- Light-theme implementation: `/tmp/polynet-general-settings-polished-light-1201.png`
- Viewport and density: baseline and implementation captured at `1201 x 1167` CSS pixels and `1201 x 1167` image pixels, 1x density. No density normalization was required.
- State: desktop web, General pane selected, dark theme, owner access, clean/saved state, free pricing, connected Stripe account.

## Full-view comparison

The implementation preserves the existing two-column composition, typography, colors, imagery, controls, and content hierarchy. It adds deliberate vertical rhythm without pushing the primary settings below the viewport, removes the non-actionable disabled Saved button, and compresses connected Stripe status into one clear row. The 1201px matched comparison has no horizontal overflow or clipped controls.

## Focused-region comparison

A separate crop was not needed because the matched 1201px full-view comparison keeps the complete settings form and small control text legible. Focused DOM measurements additionally confirmed:

- two equal `489px` desktop grid tracks at 1201px;
- one-column fallback with no horizontal overflow at 1000px and 600px;
- upload inputs remain in keyboard order with `tabIndex: 0` and are visually hidden rather than removed from layout;
- 11px helper/status text contrast is 5.92:1 in dark theme and 4.71:1 in light theme.

## Findings

- No actionable P0, P1, or P2 findings remain.
- P3: the local fixture reports the existing React `fetchPriority` development warning from `StableFramedMedia`; it is outside this slice and does not affect the rendered layout or production build.

## Required fidelity surfaces

- Fonts and typography: IBM Plex Sans, weights, hierarchy, wrapping, and line height remain consistent with the source.
- Spacing and layout rhythm: section gaps, avatar scale, text-area height, final status spacing, and desktop breakpoint are improved without introducing overflow.
- Colors and tokens: existing theme tokens are preserved; dark and light themes both render correctly.
- Image quality and asset fidelity: the live Polynet banner and avatar assets are used with their existing framing and no generated substitutes.
- Copy and content: public-profile copy is unchanged; connected Stripe status is shorter while retaining country and fee disclosure.

## Comparison history

1. Earlier audit findings: the General pane was overly compressed, the disabled Saved button duplicated the saved status, connected Stripe explanation was too long, the two-column layout engaged too early, and hidden file inputs were not keyboard-focusable.
2. Fixes: increased only the required vertical spacing, raised the two-column threshold to 900px, condensed connected Stripe status, conditionally removed the clean-state button, and replaced `display: none` file inputs with focusable visually-hidden inputs plus theme-aware focus rings.
3. Post-fix evidence: matched dark comparison, light-theme capture, 1000px and 600px responsive measurements, contrast measurements, focused contracts, TypeScript, and production build all pass.

## Primary interactions and console

- General tab selected through the shared tab control.
- Pricing and upload controls expose their expected roles in the browser DOM.
- Responsive desktop and narrow states were rendered and measured.
- Console checked; only the fixture-only pre-existing `fetchPriority` development warning described above was present.

## Implementation checklist

- [x] Preserve the canonical General settings structure.
- [x] Add deliberate vertical rhythm.
- [x] Remove the redundant clean-state button.
- [x] Condense connected Stripe status without deleting fee disclosure.
- [x] Raise the safe two-column breakpoint.
- [x] Keep image uploads keyboard-focusable with visible focus.
- [x] Verify dark, light, narrow, and 200%-equivalent layouts.

## No-banner header alignment addendum

- Source visual truth: `/var/folders/lz/8qz9l_5n1fqgg0v6wp4ydmsm0000gn/T/TemporaryItems/NSIRD_screencaptureui_ZHLkVB/Screenshot 2026-08-09 at 5.43.47 PM.png`.
- Browser-rendered implementation: `/tmp/polynet-no-banner-divider-aligned.png`; focused comparison crop: `/tmp/polynet-no-banner-divider-aligned-focus.png`.
- Viewport and density: `1280 x 720` CSS pixels at 1x density. The supplied source is a `169 x 110` focused crop; the implementation was cropped to the same `169 x 110` pixel dimensions before comparison.
- State: desktop web, dark theme, community with no banner, General channel selected.
- Root cause: the desktop no-banner identity row used a `44px` minimum height while the adjacent channel header used the shared `--web-topbar-height` value of `48px`.
- Fix: only the desktop no-banner identity row now consumes the shared topbar height for its flex basis, minimum height, and height. Banner overlays and mobile navigation retain their existing geometry.
- Post-fix browser measurements: both rows are `48px` tall, both bottom edges resolve to `73px`, divider delta is `0px`, and the page has no horizontal overflow.
- Full-view comparison: the product shell preserves its existing proportions and surfaces; only the no-banner identity divider moves down by the required four pixels.
- Focused-region comparison: normalized source and implementation crops confirm that the left and channel header divider lines now meet at one continuous y-coordinate.
- Fidelity surfaces: typography, tokens, imagery, icons, and copy are unchanged; spacing is intentionally corrected only at the divider alignment boundary.
- Interaction and console: the settings and channel-menu controls remain present and keyboard-reachable in the fixture; no console error was introduced by the CSS-only alignment rule.
- Contract coverage: the community visual identity proof now requires the two desktop divider rows to share the canonical topbar height.
- Remaining severity: no P0, P1, P2, or P3 findings remain for this alignment slice.

## Discover light-theme hover addendum

- Source visual truth: `/var/folders/lz/8qz9l_5n1fqgg0v6wp4ydmsm0000gn/T/TemporaryItems/NSIRD_screencaptureui_0n2xVf/Screenshot 2026-08-09 at 5.46.52 PM.png`.
- Browser-rendered states using the production `DiscoverCommunityCard`: `/tmp/polynet-discover-light-before.png`, `/tmp/polynet-discover-light-hover.png`, and `/tmp/polynet-discover-dark-hover.png`.
- Viewport and density: `1280 x 720` CSS pixels at 1x density; each focused implementation capture is `792 x 293` image pixels.
- State: desktop Discover, clickable community card, light default and hover states plus dark hover regression state.
- Root cause: the canonical hover rule changed both elevation and surface color for every theme. The dark `--bg-card-hover` token is intentional, but the light token darkened the card body when only the surrounding elevation should become stronger.
- Fix: a light-theme, clickable-card override preserves `--bg-card` while retaining the canonical stronger border, `translateY(-1px)`, and shadow. Skeleton/loading cards are excluded and dark theme behavior is untouched.
- Measured light default: white surface, subtle border, no shadow, no transform.
- Measured light hover: the surface remains `rgb(255, 255, 255)` while the border strengthens, the card rises one pixel, and the existing `0 10px 26px rgba(0, 0, 0, 0.22)` shadow appears.
- Measured dark hover: the surface still changes from `rgba(42, 42, 42, 0.9)` to `rgba(50, 50, 50, 0.95)` with the same stronger border, lift, and shadow.
- Full-view and focused comparison: the supplied Discover screenshot establishes the affected light surface; the focused before/hover captures confirm that imagery, typography, copy, layout, and card dimensions remain unchanged while elevation becomes visible around the white card.
- Accessibility: the actual card retains `role="button"` and `tabIndex="0"`; this CSS-only rule does not alter keyboard semantics or focus rules.
- Console: no slice-specific error was introduced. The fixture reports only the pre-existing React `fetchPriority` development warning from `StableFramedMedia` already documented above.
- Contract coverage: the Discover contract now protects both the canonical dark hover treatment and the light clickable-card surface override.
- Remaining severity: no P0, P1, P2, or P3 findings remain for this hover slice.

final result: passed
