# Workflows compact utility header design QA

## Evidence

- Source visual truth: `docs/design-qa/workflows-utility-header/reference-resources.jpg`
- Implementation: `docs/design-qa/workflows-utility-header/implementation-workflows.jpg`
- Combined full-view comparison: `docs/design-qa/workflows-utility-header/comparison.png`
- Responsive implementation: `docs/design-qa/workflows-utility-header/implementation-workflows-mobile.jpg`
- Source pixels: 1138 x 707
- Implementation pixels: 1138 x 707
- CSS viewport: 1138 x 707
- Device pixel ratio: 1
- Responsive viewport: 390 x 844 at device pixel ratio 1
- State: authenticated Cosmic-theme builder; empty Resources catalog compared with
  the blank one-stage Workflows canvas.
- Staging build: `0d3dea7cc6eb2388dfd0540ce04196255648c8d2`

## Full-view comparison

Resources and Workflows now share the same compact utility-row geometry. Their
page labels have the same x/y origin (`324.59`, `25`), 16px rendered height,
typography class, and top-band rhythm. The first Resources card and the first
workflow stage both begin at y=75. Workflows retains its intentional full-height
board and internal horizontal scrolling.

No focused crop was needed: the full captures render the complete utility row,
first content object, shell controls, and stage Add action legibly. Bounding-box
measurements were used to verify the header/content alignment exactly.

## Required fidelity surfaces

- Fonts and typography: both labels use the canonical `resources-header`
  treatment. The semantic Workflows `h1` has its default heading weight and
  margin neutralized so it matches Resources visually.
- Spacing and layout rhythm: title origins and first-content y positions match.
  The former Workflows title, subtitle, 28px top padding, and 24px canvas gap are
  absent.
- Colors and visual tokens: both surfaces use the same existing theme tokens;
  no new literal colors or surface effects were introduced.
- Image quality and assets: no new image asset is part of this slice. Both
  captures use the same canonical community banner and shell assets.
- Copy and content: Workflows contains only the compact page label. The former
  explanatory subtitle is absent.

## Interaction and responsive checks

- Add stage was enabled.
- Clicking Add stage created Stage 2 and opened `Set up stage 2`.
- Cancel removed the provisional stage and restored the one-stage canvas.
- The page had no document-level horizontal overflow at 1138px or 390px.
- The stage canvas retained internal horizontal scrolling at 390px.
- Browser console errors: none.

## Findings

No actionable P0, P1, or P2 mismatch remains.

The stage is intentionally taller than the Resources course card because it is
a member pipeline column, not a catalog card. That difference preserves the
product behavior while matching the requested header and content origin.

## Comparison history

- Iteration 1: post-implementation comparison found no actionable P0, P1, or
  P2 visual mismatch. No corrective visual iteration was required.

## Follow-up polish

- P3: the 34px terminal Add control is smaller than a generous touch target.
  It remains unchanged because control sizing was outside this layout-only
  slice.

final result: passed
