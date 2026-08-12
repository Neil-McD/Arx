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

## General settings responsive composition addendum

- Source visual truth: `/var/folders/lz/8qz9l_5n1fqgg0v6wp4ydmsm0000gn/T/TemporaryItems/NSIRD_screencaptureui_a4GJp7/Screenshot 2026-08-09 at 7.28.44 PM.png`.
- Browser-rendered implementation: `/tmp/polynet-general-settings-responsive-20260809/implementation-931x800-dark-final2.jpg`, `/tmp/polynet-general-settings-responsive-20260809/implementation-931x800-light-final2.jpg`, `/tmp/polynet-general-settings-responsive-20260809/implementation-1100x1291-dark-v3.jpg`, and `/tmp/polynet-general-settings-responsive-20260809/implementation-1100x1291-light-v3.jpg`.
- Focused comparison: `/tmp/polynet-general-settings-responsive-20260809/comparison-source-implementation-large.png` places the supplied large-monitor source above the revised component at matching height.
- Viewports and density: `931 x 800` models the `883px` General-form width visible inside a 1280px product shell; `1100 x 1291` exercises the tall-monitor regime; `807 x 900` and `727 x 900` exercise the compact and narrow container regimes. Captures are 1x CSS-pixel images.
- State: General pane, owner access, connected Stripe account, free pricing, saved and dirty-save states, dark and light themes.
- Root cause: the previous form had one abrupt desktop breakpoint and fixed vertical rhythm. It became a single dense block at large viewports while narrower desktop widths either stacked too early or compressed nested pricing controls.
- Fix: the form now has three width behaviors: roomy two-column with split access controls at `820px+`, compact two-column with stacked access controls at `680-819px`, and a true single-column fallback below `680px`. Width and gaps are fluid, while tall desktop viewports expand the real banner, text areas, section gaps, and final action separation.
- MacBook acceptance: at an `883px` form width and `800px` viewport height, the saved and dirty states fit without document or panel overflow; the final action row ends at `704px` and the dirty Save changes button remains visible.
- Tall-monitor acceptance: at `1100 x 1291`, the content grows from the prior `701px` form height to `840px`; the final action row ends at `849px`, leaving intentional lower breathing room without stretching individual controls or inserting a full-height blank spacer.
- Compact acceptance: a `759px` form remains two-column with nested access controls stacked and no horizontal overflow. At `679px`, the canonical single-column layout takes over and scrolls vertically as expected.
- Fidelity surfaces: component structure, copy, images, typography, theme tokens, control semantics, save behavior, Stripe state, and persistence logic are unchanged.
- Remaining severity: no P0, P1, P2, or P3 findings remain for this responsive composition slice.

final result: passed

## Resources course presentation addendum

### Evidence

- Source visual truth, course catalog: `/var/folders/lz/8qz9l_5n1fqgg0v6wp4ydmsm0000gn/T/TemporaryItems/NSIRD_screencaptureui_j0eN1H/Screenshot 2026-08-10 at 5.55.21 PM.png`
- Source visual truth, selected course: `/var/folders/lz/8qz9l_5n1fqgg0v6wp4ydmsm0000gn/T/TemporaryItems/NSIRD_screencaptureui_wLId5c/Screenshot 2026-08-10 at 5.55.43 PM.png`
- Existing Polynet surface baseline: `/var/folders/lz/8qz9l_5n1fqgg0v6wp4ydmsm0000gn/T/TemporaryItems/NSIRD_screencaptureui_R37OCC/Screenshot 2026-08-10 at 5.55.04 PM.png`
- Browser-rendered implementation screenshot: unavailable; this code state has not been staged or published, and local browser rendering is not an available verification path for this task.
- Source image dimensions: all three supplied captures are `3024 x 1964` pixels. They represent desktop Chrome at Retina density; exact CSS viewport and device scale factor were not recorded in the source files.
- Implementation viewport, pixel dimensions, CSS size, and density normalization: unavailable until the code is reachable in the authorized Chrome staging or production surface.
- State: dark-theme Resources root and selected course, manager access.

### Full-view comparison

The three source images were opened and reviewed together. They establish the intended shift from Polynet's current wiki-like resource rail to a course catalog followed by a selected-course lesson outline and reader. A valid full-view comparison against the implementation cannot be made until this code is browser-rendered in the same authenticated product shell.

### Focused-region comparison

Blocked for the same reason. The implementation screenshot needed to compare card crop, course metadata density, header hierarchy, lesson-outline width, reader balance, and manager controls does not exist yet.

### Findings

- [P2] Browser-rendered visual acceptance remains unverified.
  Location: Resources catalog, selected course shell, and course editor.
  Evidence: source screenshots are available, but no rendered implementation screenshot exists at a matched viewport and state.
  Impact: production build and contract proofs establish structural correctness, but cannot prove card proportions, responsive wrapping, light/dark polish, or authenticated interaction behavior.
  Fix: publish or stage this exact code state through the canonical GitHub workflow, then capture the Resources root, selected course, and course editor in the user's Chrome session in dark and light themes.

### Required fidelity surfaces

- Fonts and typography: code reuses the product font and text tokens; browser-rendered weights, wrapping, and optical hierarchy remain unverified.
- Spacing and layout rhythm: catalog and course-shell tracks have explicit desktop and narrow breakpoints; rendered proportions remain unverified.
- Colors and visual tokens: all new UI uses existing semantic theme tokens; dark/light browser output remains unverified.
- Image quality and asset fidelity: course covers use canonical `StableFramedMedia` focus and zoom metadata; real cover crops remain unverified.
- Copy and content: course, lesson, source inbox, draft/live, empty, and manager-action terminology is implemented and contract-protected.

### Primary interactions and console

- Code and contract coverage confirm catalog selection, back navigation, lesson selection, outline collapse, course editing, cover upload/focus/removal, manager menus, source intake, and responsive structure.
- Browser interaction and console checks are blocked until this exact code state is reachable in Chrome.

### Comparison history

- No visual fix iteration has been claimed. The source references were opened, the code was built and reviewed, and the remaining gate is the first matched browser capture.

### Implementation checklist

- [x] Build course catalog over canonical resource modules.
- [x] Keep legacy unassigned pages in a separate manager maintenance entry.
- [x] Build selected-course lesson outline over canonical page resources.
- [x] Preserve the existing resource reader and source lineage.
- [x] Restore course name, description, cover, crop, ordering, and draft/live authoring.
- [x] Add responsive and keyboard-accessible structures.
- [x] Pass production build and focused Resources contracts.
- [ ] Capture and compare the exact implementation in Chrome after an authorized release.

final result: blocked

## Mobile global-root shell expansion addendum

### Evidence

- Interaction model: authenticated mobile global destinations retain one continuous community rail, inset content surface, and bottom navigation shell.
- Framed destinations: Community Home, Discover, Global Settings, Polynet AI, Direct Messages, and community switching.
- Focused destinations: channels, Resources, Events, community settings, and other community-detail routes intentionally omit the global wraparound frame.
- Browser-rendered implementation capture: unavailable. This exact revision has not been deployed, and local-browser review is intentionally excluded for this product workflow.

### Full-view comparison

Blocked until this exact revision is deployed and captured in authenticated iPhone Safari or the home-screen PWA. The implementation review establishes the route boundary and shell geometry, but does not claim pixel-level visual acceptance.

### Focused-region comparison

Blocked for the same reason. Required focused regions are the Discover and Settings frame edges, the AI and DM panel junction with the community rail, the bottom-left rail continuity, and the transition from a framed global root into an unframed community detail.

### Findings

- No source-level P0 or P1 issue remains in the canonical global-shell projection.
- Dedicated AI and DM roots are bounded inside the shell geometry rather than covering the community rail or bottom navigation.
- Global rail actions reset thread, DM, overlay, and mobile-root state before routing, preventing stale overlays from surviving a destination change.
- P2 verification gap: iPhone safe-area behavior, long-page scrolling, and light-theme shell contrast remain unverified until the exact revision is deployed.

### Implementation checklist

- [x] Use one route predicate for framed global roots.
- [x] Preserve focused, unframed community-detail routes.
- [x] Reuse one mobile community rail component across every framed root.
- [x] Constrain Discover and Settings workspaces to the inset shell surface.
- [x] Keep AI and DM panels clear of both the community rail and bottom navigation.
- [x] Exit incompatible overlay state atomically before global navigation.
- [x] Delete the superseded Community-Home-only wrapper.
- [ ] Capture and compare the exact deployed state in iPhone Safari and the home-screen PWA.

final result: blocked

## Resources course simplification production addendum

### Evidence

- Source visual truth, catalog: `/var/folders/lz/8qz9l_5n1fqgg0v6wp4ydmsm0000gn/T/TemporaryItems/NSIRD_screencaptureui_CoynQW/Screenshot 2026-08-10 at 10.19.46 PM.png`
- Source visual truth, selected course: `/var/folders/lz/8qz9l_5n1fqgg0v6wp4ydmsm0000gn/T/TemporaryItems/NSIRD_screencaptureui_eNy8LY/Screenshot 2026-08-10 at 10.20.37 PM.png`
- Browser-rendered catalog, dark: `/tmp/polynet-resources-design-qa/resources-production-dark.png`
- Browser-rendered catalog hover and menu: `/tmp/polynet-resources-design-qa/resources-production-hover.png` and `/tmp/polynet-resources-design-qa/resources-production-menu-open.png`
- Browser-rendered selected course, dark: `/tmp/polynet-resources-design-qa/resources-production-course.png`
- Browser-rendered catalog and selected course, light: `/tmp/polynet-resources-design-qa/resources-production-light-hydrated.png` and `/tmp/polynet-resources-design-qa/resources-production-light-course.png`
- Full-view comparison evidence: `/tmp/polynet-resources-design-qa/catalog-comparison.png` and `/tmp/polynet-resources-design-qa/course-comparison.png`
- Production identity: `https://www.polynet.ai/version.json` returned build `ed41c615e1b27146cd4f67e6cbacd06cb048e118`.
- Viewport and density: implementation captured at `1243 x 707` CSS pixels and `1243 x 707` image pixels. Chrome reported DPR 2, while the browser screenshot API normalized output to one image pixel per CSS pixel. The catalog source is `2078 x 996` and was normalized to `1243 x 596`; the selected-course source is `2388 x 1282` and was normalized to `1243 x 667` with Lanczos scaling. The source crops exclude parts of the Polynet shell, so comparison is component-level rather than falsely pixel-exact across browser chrome.
- State: authenticated owner/manager, production, dark and light themes, Resources catalog, card hover, card action menu, selected course, and member preview mode.

### Full-view comparison

The catalog now has one primary object and one primary creation affordance: the real course card and a same-track, same-height add-course card. The top header is reduced to Resources context plus preview mode; source intake, the count badge, and duplicate add/edit/status actions are absent. The selected-course view preserves Polynet's shell while matching the reference's left lesson sequence and right lesson content hierarchy.

### Focused-region comparison

The catalog comparison verifies card/add-card parity, dashed creation treatment, real cover imagery, and removal of header action clutter. The selected-course comparison verifies the narrower lesson rail, high-salience selected row, title/media hierarchy, and retained add-lesson affordance. Separate hover and open-menu captures verify that course management is hidden until intent and that the menu contains only `Edit course`, `Move to draft`, and `Delete` for the one-course state.

### Findings

- No actionable P0, P1, or P2 findings remain.
- Residual test gap: the Chrome extension retained the user's `1243 x 707` viewport when a temporary narrow-viewport override was requested, so this production pass does not claim a separate responsive screenshot. Existing responsive CSS, TypeScript, production build, and Resources contract proofs passed; the supplied visual targets are desktop-only.

### Required fidelity surfaces

- Fonts and typography: IBM Plex Sans, course-card hierarchy, lesson labels, small metadata, wrapping, and optical weights are consistent across dark and light production states.
- Spacing and layout rhythm: the two-column catalog grid, equal card heights, 20px peer gap, reduced header density, lesson-rail width, selected-row padding, and reader balance match the intended simple course model without clipping at the verified viewport.
- Colors and visual tokens: dark and light surfaces use existing Polynet tokens. The selected lesson reuses the canonical `--surface-selected`, `--stroke-selected`, and `--text-selected` contract rather than introducing a Resources-only accent.
- Image quality and asset fidelity: the production course uses its real framed community cover and real YouTube media. No placeholder artwork, generated substitute, custom SVG art, or CSS illustration was introduced.
- Copy and content: `Add course`, lesson counts, course description, draft/live language, add-lesson copy, and preview labels are concise and coherent. The removed `Add sources` action is no longer promised by builder copy.
- Icons and affordances: Lucide controls have consistent stroke weight and alignment. The overflow menu appears on hover/focus; touch CSS keeps management controls visible where hover does not exist.

### Primary interactions and console

- Hover revealed the course overflow control; the one-course menu exposed only Edit course, Move to draft, and Delete.
- Opening the course selected the first lesson and preserved all three lesson entries plus Add lesson.
- Preview mode hid the add-course card and manager menu, then restored them when switched off.
- Light theme rendered both catalog and selected-course states correctly; the user's dark theme was restored afterward.
- Final production state was left on `/c/polynet/resources`, dark theme, preview off.
- Chrome console was checked after catalog and selected-course interactions; no warnings or errors were present.

### Comparison history

1. The earlier Resources presentation QA was blocked because the implementation had not been browser-rendered.
2. The approved simplification removed source intake and duplicated header controls, added the peer add-course card, consolidated management into the course-card overflow, removed redundant top/bottom ordering accelerators, and applied canonical selection tokens to lessons.
3. Production build `ed41c615e1b27146cd4f67e6cbacd06cb048e118` was captured in authenticated Chrome and compared in combined catalog and selected-course evidence. No post-deployment P0, P1, or P2 correction was required.

### Implementation checklist

- [x] Replace the header add-course control with a same-sized catalog card.
- [x] Remove primary Resources source intake and stale builder copy.
- [x] Move edit, status, and delete management into the hover/focus overflow.
- [x] Keep canonical source lineage and existing-source recovery paths intact.
- [x] Reuse canonical selected-navigation tokens for lesson rows.
- [x] Verify manager preview behavior, dark and light themes, hover/menu state, course navigation, console health, and exact production identity.
- [x] Pass the full release gate and publish through GitHub to the canonical Polynet production project.

final result: passed

## Resources shell compaction production addendum

### Evidence

- Source visual truth, catalog: `/var/folders/lz/8qz9l_5n1fqgg0v6wp4ydmsm0000gn/T/TemporaryItems/NSIRD_screencaptureui_mJoXQ8/Screenshot 2026-08-10 at 11.00.50 PM.png`
- Source visual truth, selected course: `/var/folders/lz/8qz9l_5n1fqgg0v6wp4ydmsm0000gn/T/TemporaryItems/NSIRD_screencaptureui_pMrTzb/Screenshot 2026-08-10 at 11.00.41 PM.png`
- Browser-rendered catalog: `/tmp/polynet-resources-shell-compaction-catalog.png`
- Browser-rendered selected course: `/tmp/polynet-resources-shell-compaction-course.png`
- Combined full-view comparisons: `/tmp/polynet-resources-shell-compaction-catalog-comparison.png` and `/tmp/polynet-resources-shell-compaction-course-comparison.png`
- Production identity: `https://www.polynet.ai/version.json` returned build `691b989b7924502a0be8f6cb2d8d47f44b31b6ed` in `production`.
- Source dimensions: both supplied screenshots are `3024 x 1964` pixels. They include desktop and browser chrome, so each was proportionally normalized to `1243 x 808` for the combined comparisons.
- Implementation viewport and density: `1243 x 707` CSS pixels, Chrome DPR 2, and `1243 x 707` screenshot pixels. Chrome's screenshot output is normalized to one image pixel per CSS pixel.
- State: authenticated owner/manager, production, dark theme, preview mode off, Resources catalog and selected course.

### Full-view comparison

The source and production captures were stacked into the same comparison images before judgment. The revised catalog replaces the prior approximately 66px blank shell band plus nested catalog indent with one 48px utility row and an 8px content offset. The course card now begins at `y=75`, while the heading and catalog share the same `x=345.59` alignment. In the selected course, the lesson outline and reader begin together at `y=67`; the previous repeated course-description block is gone.

### Focused-region comparison

A separate crop was not needed because the browser-rendered panel occupies the full `1243 x 707` capture and all affected controls are readable. DOM measurements were used to verify the exact alignment and collision boundaries: the header is 48px high, panel padding is `0 24px 24px`, the panel gap is 10px, the DM safe inset is 62px, and the preview control ends 47px before the floating DM button begins.

### Findings

- No actionable P0, P1, or P2 findings remain.
- Residual P3 test gap: this geometry-only slice was visually checked in the supplied dark-theme state. The light-theme token path and mobile Resources override were unchanged and passed the existing theme and release contracts, but no additional light or mobile screenshot was needed for this desktop spacing target.

### Required fidelity surfaces

- Fonts and typography: IBM Plex Sans and the existing heading, metadata, and lesson weights are unchanged. The compact course context truncates safely and remains optically secondary to the lesson title.
- Spacing and layout rhythm: header, catalog, outline, and reader now share one left edge; the course workspace starts 10px below the shell utility row; no horizontal overflow is present.
- Colors and visual tokens: no color token changed. The existing dark surfaces, selected-lesson tokens, borders, and muted metadata remain coherent.
- Image quality and asset fidelity: real course-cover and YouTube assets retain their existing crop, sharpness, and framing. No placeholder or replacement art was introduced.
- Copy and content: the catalog description remains on the course card, while the selected-course header keeps only `Resources` and the course name. Preview, lesson, and manager copy are unchanged.

### Primary interactions and console

- Opened the real production course from the catalog and verified the selected lesson, video, and lesson outline.
- Verified the preview control and floating DM button have 47px of horizontal separation at the tested viewport.
- Verified the document and body have zero horizontal overflow.
- Chrome console was checked after catalog and course navigation; no warnings or errors were present.

### Comparison history

1. The supplied screenshots exposed large unused top space and a redundant catalog gutter.
2. The implementation reused the canonical 48px shell band, preserved the canonical 62px DM safe inset, reduced panel-to-content spacing, aligned the catalog to the heading, and collapsed selected-course context into one line.
3. The first matched production comparison found no P0, P1, or P2 issue, so no post-release correction iteration was required.

### Implementation checklist

- [x] Reuse the existing shell band instead of adding absolute positioning or negative margins.
- [x] Preserve an explicit DM-button collision boundary.
- [x] Align catalog cards and selected-course workspace to the Resources heading.
- [x] Remove repeated selected-course description copy without deleting course metadata.
- [x] Preserve preview mode, course cards, lesson content, backend authority, and mobile overrides.
- [x] Pass focused contracts, typecheck, production build, and the full release gate.
- [x] Capture and compare the authenticated production catalog and selected-course states in Chrome.

final result: passed

## Mobile community shell continuity implementation addendum

### Evidence

- Source visual truth: `/var/folders/lz/8qz9l_5n1fqgg0v6wp4ydmsm0000gn/T/codex-clipboard-b471b202-b412-4357-9ad2-5c534223e8a2.png`
- Source dimensions: `1320 x 2868` pixels.
- Intended state: authenticated mobile Community Home, dark theme, community rail visible, member-view permission available.
- Browser-rendered implementation capture: unavailable. The exact local revision has not been deployed, and local-browser review is intentionally excluded for this product workflow.

### Full-view comparison

Blocked until this exact revision is deployed and captured in the authenticated iPhone Safari or home-screen PWA state. No visual-pass claim is made from source inspection alone.

### Focused-region comparison

Blocked for the same reason. The required focused regions are the banner action corner, the new Members navigation row above Resources, and the junction between the left community rail and bottom navigation rail.

### Findings

- No source-level P0 or P1 issue was found in the implementation review.
- P2 verification gap: pixel-level shell continuity, safe-area behavior, and top-right settings placement remain unverified in a real iPhone/PWA render until deployment is authorized.

### Required fidelity surfaces

- Fonts and typography: unchanged; the existing mobile Community Home typography remains authoritative.
- Spacing and layout rhythm: the authenticated header removes the duplicate member pill, leaving Settings as the sole banner action. Members is inserted immediately above Resources in the community navigation.
- Colors and visual tokens: the bottom navigation uses the canonical rail surface token, and its active-icon cutout and notification-dot border inherit that same surface.
- Image quality and asset fidelity: community banner and community avatars are unchanged.
- Copy and content: only the canonical `Members` navigation label and optional count are added.

### Primary interactions and console

- The Members row reuses the existing permission-gated `members` overlay and introduces no new route or state machine.
- Visitor funnel behavior retains the existing header member affordance because that state has no community navigation replacement.
- Authenticated Chrome/PWA interaction and console verification remain blocked until the exact revision is deployed.

### Comparison history

1. The supplied production screenshot established the current shell seam and duplicated member control.
2. The implementation removes the authenticated header duplication, adds one mobile-only Members row, and unifies the bottom navigation material with the community rail.
3. No post-render correction iteration is claimed because an implementation capture does not yet exist.

### Implementation checklist

- [x] Keep one stable Home root in the bottom navigation.
- [x] Move authenticated member access into the community navigation above Resources.
- [x] Preserve visitor-funnel member access.
- [x] Reuse the existing permission gate and members overlay.
- [x] Join the bottom navigation to the rail through canonical surface tokens without covering the lower-left Settings control.
- [x] Pass web typecheck and focused mobile navigation/reading-mode contracts.
- [ ] Capture and compare the exact deployed state in iPhone Safari and the home-screen PWA.

final result: blocked


---

# Funnel Dark-Theme Design QA

## Source truth

- Current production reference: `/Users/neilmcdevitt/.codex/visualizations/2026/08/12/019ff6af-246b-7f92-824e-b10b1b698dd6/theme-audit/01-live-funnel-current.jpg`
- Target visual system: canonical Polynet Dark tokens in `apps/web/src/base.css` (background, action, text, border, brand, agent, and attention roles at lines 16-104).
- Implemented CSS: `apps/web/src/components/polynetLanding/ConversionLanding.css`

## Final capture

- Implementation screenshot: `/Users/neilmcdevitt/.codex/visualizations/2026/08/12/019ff6af-246b-7f92-824e-b10b1b698dd6/theme-implementation/01-dark-theme-hero-desktop.jpg`
- Before/after comparison: `/Users/neilmcdevitt/.codex/visualizations/2026/08/12/019ff6af-246b-7f92-824e-b10b1b698dd6/theme-implementation/04-before-after-comparison.jpg`
- Focused interaction/mechanism capture: `/Users/neilmcdevitt/.codex/visualizations/2026/08/12/019ff6af-246b-7f92-824e-b10b1b698dd6/theme-implementation/02-dark-theme-mechanism-desktop.jpg`
- Viewport: 1280 x 720 CSS pixels
- Screenshot dimensions: 1280 x 720 pixels
- Device density: 1
- State: public conversion landing page, initial hero at scroll position 0; secondary capture includes the primary CTA focus state and the three-pillar section.

## Comparison and findings

The current production capture and implementation capture were combined in one side-by-side comparison input before judgment. The implementation intentionally preserves the approved copy, typography, spacing, hierarchy, VSL asset, and funnel structure while replacing the disconnected neon treatment with the product's canonical Dark language.

- Colors: warm graphite `#1a1a1a`, cream `#fcf8f0`, muted warm text, neutral borders, and cream action surface match the product theme. Dusty rose is limited to brand/community identity; blue is attention/flow; purple is agent intelligence.
- Typography and layout: hero measure, headline wrapping, section order, and CTA hierarchy remain consistent with the source. No reflow regression was observed at the validated desktop viewport.
- Media and assets: the existing logo and Vimeo VSL remain unchanged and render correctly.
- Copy: the approved autonomous client-success positioning and three-pillar copy remain unchanged.
- Interaction: primary CTA focus treatment was exercised in the isolated QA route; the temporary route used a no-op handler so checkout was not invoked. The focus ring is visible and uses the canonical cream action role.
- Console: checked after initial render and interaction. No warning or error entries were present; only Vite connection, React development-tools, and successful Convex health messages appeared.
- Responsive note: the browser's viewport override did not apply in this environment and continued reporting 1280 x 720. No responsive layout rules were changed by this slice; existing media queries remain intact, and type/build validation covers the same production bundle.

## Review history

1. Initial implementation capture: no P0, P1, or P2 visual defects found. The intended delta is present and the existing funnel hierarchy is preserved.
2. Focused CTA/mechanism review: focus visibility and semantic accent separation passed. No corrective code iteration was required.

## Final result

passed


---

# Funnel Premium-Neutral Design QA

## Source truth

- Selected visual target: `/Users/neilmcdevitt/.codex/generated_images/019ff6af-246b-7f92-824e-b10b1b698dd6/exec-509e1220-816a-45f3-b2fb-eba00230b1bf.png`
- Target pixels: 986 x 1596.
- Required product constraint: preserve the existing funnel layout, hierarchy, copy, VSL, conversion path, and responsive behavior; change only color, lighting, surface, and material finish.
- Implemented CSS: `apps/web/src/components/polynetLanding/ConversionLanding.css`.

## Browser-rendered evidence

- Full source/implementation comparison: `/Users/neilmcdevitt/.codex/visualizations/2026/08/12/019ff6af-246b-7f92-824e-b10b1b698dd6/premium-neutral-implementation/09-source-implementation-full-comparison.png`
- Focused hero comparison: `/Users/neilmcdevitt/.codex/visualizations/2026/08/12/019ff6af-246b-7f92-824e-b10b1b698dd6/premium-neutral-implementation/10-source-implementation-hero-comparison.png`
- Exact before/after viewport comparison: `/Users/neilmcdevitt/.codex/visualizations/2026/08/12/019ff6af-246b-7f92-824e-b10b1b698dd6/premium-neutral-implementation/12-before-after-1280x720.png`
- Desktop hero: `/Users/neilmcdevitt/.codex/visualizations/2026/08/12/019ff6af-246b-7f92-824e-b10b1b698dd6/premium-neutral-implementation/02-premium-neutral-hero-1440x1024.png`
- Desktop mechanism: `/Users/neilmcdevitt/.codex/visualizations/2026/08/12/019ff6af-246b-7f92-824e-b10b1b698dd6/premium-neutral-implementation/03-premium-neutral-mechanism-1440x1024.png`
- Desktop lower section: `/Users/neilmcdevitt/.codex/visualizations/2026/08/12/019ff6af-246b-7f92-824e-b10b1b698dd6/premium-neutral-implementation/04-premium-neutral-lower-1440x1024.png`
- Desktop closing conversion section: `/Users/neilmcdevitt/.codex/visualizations/2026/08/12/019ff6af-246b-7f92-824e-b10b1b698dd6/premium-neutral-implementation/05-premium-neutral-closing-1440x1024.png`
- Mobile hero: `/Users/neilmcdevitt/.codex/visualizations/2026/08/12/019ff6af-246b-7f92-824e-b10b1b698dd6/premium-neutral-implementation/06-premium-neutral-mobile-390x844.png`
- Mobile mechanism: `/Users/neilmcdevitt/.codex/visualizations/2026/08/12/019ff6af-246b-7f92-824e-b10b1b698dd6/premium-neutral-implementation/07-premium-neutral-mobile-mechanism-390x844.png`

## Capture normalization

- Desktop viewport override: 1440 x 1024 CSS pixels; browser content capture: 1429 x 1016 pixels; device density: 1.
- Exact before/after viewport override: 1280 x 720 CSS pixels; implementation capture: 1269 x 714 pixels; device density: 1. The prior implementation capture is 1280 x 720; both are shown uncropped in the comparison board.
- Mobile viewport override: 390 x 844 CSS pixels; browser content capture: 379 x 820 pixels; device density: 1.
- The browser surface excludes its scrollbar/chrome from raster output. Layout and overflow assertions use the live CSS viewport values rather than inferring them from raster dimensions.
- State: anonymous public landing page rendered through an isolated local QA entry with the production component and stylesheet. The CTA handler was a no-op so checkout could not be invoked during visual testing.

## Findings

- No actionable P0, P1, or P2 mismatch remains.
- Fonts and typography: the existing Sora/Inter system, weights, wrapping, hierarchy, antialiasing, and type measures are unchanged. The implementation retains the live layout as explicitly required instead of adopting the generated target's compressed vertical scale.
- Spacing and layout rhythm: widths, grids, section order, margins, padding, radii, breakpoints, and sticky behavior are unchanged. The 1280 x 720 before/after board confirms that the visual upgrade does not recompose the hero.
- Colors and visual tokens: the canvas is carbon black; text is warm ivory/stone; borders and diagram intelligence are neutral silver; icy blue is the only non-brand signal accent. Purple is absent. Dusty rose is restricted to the Polynet wordmark period and supplied logo asset.
- Elevation and polish: the VSL has a controlled silver edge, neutral depth shadow, and restrained icy-blue atmospheric spill. The CTA remains the highest-contrast conversion element. The closing section has localized light without becoming a card.
- Image quality and assets: the supplied Polynet logo and existing Vimeo VSL are unchanged, sharp, correctly cropped, and retain their native controls. No placeholder, generated replacement, or code-drawn asset was introduced.
- Copy and content: all approved autonomous client-success copy, the three pillars, pricing, fee disclosure, and legal/footer content are unchanged.
- Responsiveness: desktop and 390 px mobile captures show no horizontal overflow. Mobile preserves the existing single-column mechanism and full-width CTA.
- Accessibility and interaction: the primary CTA remained enabled, the local no-op activation did not navigate, keyboard focus produced a 2 px cream outline, and reduced-motion behavior remains present in the unchanged media query.
- Console: no warning or error entries were present after render, responsive checks, and CTA interaction.

## Comparison history

1. First source/implementation comparison: no P0, P1, or P2 defects were found. The generated visual target and implementation share the approved black/ivory/silver/blue material direction; the implementation intentionally preserves the live layout rather than copying the mock's compressed page geometry.
2. Focused hero and exact before/after comparisons: the VSL elevation, premium canvas, CTA hierarchy, and unchanged funnel composition passed. No post-capture corrective iteration was required.

## Implementation checklist

- [x] Preserve all layout, copy, VSL, pricing, and conversion behavior.
- [x] Remove purple from the landing palette and contract.
- [x] Restrict pink to the Polynet identity.
- [x] Reintroduce premium depth through localized neutral and icy-blue light.
- [x] Preserve desktop and mobile overflow behavior.
- [x] Exercise CTA activation and keyboard focus without invoking checkout.
- [x] Check the browser console.
- [x] Compare source and browser implementation in the same visual inputs.

final result: passed
