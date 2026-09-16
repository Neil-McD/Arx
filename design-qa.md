# Members list refinement — 2026-09-08

- Source: supplied Screenshot 2026-09-08 at 12.32.59 PM (Skool member list), with explicit user exclusions: activity timestamps, duplicate Invite, unsupported profile/billing fields. This is a directional adaptation, not a pixel clone.
- Implementation: staging build `038765fe916e9a94d7246bf99b3a65dd6ad8f84d`, `/c/concierge-welcome-canary-2026-08-20-b/members`; browser screenshots captured inline in this task at desktop 1079x706 and mobile 390x844 CSS pixels.
- Comparison: reference uses full-width stacked people rows with dividers; implementation now follows that structure using Polynet typography, theme tokens and canonical 40px avatars. Source desktop screenshot includes browser/OS chrome and different member content; no pixel-fidelity claim.
- Removed oversized card grid, activity labels/helper/styles, header Invite and its state/prop/helper export. No invented bio, billing, renewal or acquisition information.
- Verified desktop and narrow member layouts, profile open/Back, and absence of manager controls for ordinary members. No clipping or actionable visual defects observed. Full release gate: 1,229 tests passed.
- Remaining coverage: light-theme visual pass not repeated in this slice; shared theme tokens retained. Member handles/bios require authorized directory data and remain in profiles for now.
- final result: passed

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
