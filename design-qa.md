# Polynet join-request divider design QA

## Source visual truth

- Existing Polynet chat day-divider language:
  `/var/folders/lz/8qz9l_5n1fqgg0v6wp4ydmsm0000gn/T/TemporaryItems/NSIRD_screencaptureui_IsBMci/Screenshot 2026-08-09 at 1.03.04 PM.png`
- Source pixels: 948 × 388.
- The source establishes a centered, quiet label between two 1px divider segments with no capsule surface.

## Browser-rendered implementation

- Exact `CommunityContextPanel` component rendered from the release worktree through a temporary, unshipped Vite QA entry.
- Dark collapsed focus capture: `/tmp/polynet-request-divider-dark-focus.png` (320 × 220 pixels).
- Dark full capture: `/tmp/polynet-request-divider-dark-collapsed.png` (1280 × 720 pixels).
- Dark expanded capture: `/tmp/polynet-request-divider-dark-expanded.png` (1280 × 720 pixels).
- Light singular capture: `/tmp/polynet-request-divider-light-singular-v2.png` (1280 × 720 pixels).
- Loading/zero-count capture: `/tmp/polynet-request-divider-loading-empty.png` (1280 × 720 pixels).
- Combined comparison: `/tmp/polynet-request-divider-comparison.png` (1100 × 850 pixels).
- CSS panel size: 320 × 620 CSS px; focused comparison region: 320 × 220 CSS px.
- Browser density: normalized 1:1 for the focused capture and combined comparison.

## State and interaction coverage

- Dark theme, two confirmed requests, collapsed.
- Dark theme, two confirmed requests, expanded.
- Light theme, one confirmed request, collapsed.
- Dark theme, zero requests while loading.
- Click expansion, singular/plural copy, `aria-expanded`, request actions, and zero-count non-rendering were verified.
- Browser console: no warnings or errors.

## Comparison evidence

- Full-view comparison: the existing day dividers and new request divider use the same quiet visual hierarchy and tokenized line treatment.
- Focused comparison: the new divider has a centered label, balanced horizontal segments, no capsule border/background, and a compact chevron that communicates expansion without becoming a second control.
- No additional focused crop was needed beyond the 320 × 220 rail capture because the changed surface is isolated to the divider and its immediate member-header context.

## Required fidelity surfaces

- Fonts and typography: existing IBM Plex Sans inheritance retained; 11px/500 UI label remains subordinate to the member header.
- Spacing and layout rhythm: symmetric lines, 8px rail inset, and compact vertical spacing match the established divider rhythm.
- Colors and tokens: lines use `--stroke-divider-accent`; label uses `--text-muted`, with `--text-primary` only on hover.
- Image quality and assets: no image assets were added or substituted; existing avatar and Lucide icon paths remain intact.
- Copy and content: `1 request to join`, plural counts, and `200+ requests to join` are explicit and bounded.

## Findings

- No actionable P0, P1, or P2 visual differences.
- The temporary light-theme fixture initially exposed its transparent rail against the fixture's dark stage; the fixture was corrected to use the real `--surface-panel` token and recaptured. This was not an application defect.

## Comparison history

- Pass 1: dark collapsed, expanded, and zero-count states matched the intended interaction and divider language.
- Pass 2: light fixture background corrected; post-fix capture confirmed proper light surface, contrast, and divider visibility.
- Final combined source/implementation comparison found no remaining P0/P1/P2 mismatch.

final result: passed
