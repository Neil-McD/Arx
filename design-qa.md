# Design QA — onboarding personal-agent spotlight

- Source visual truth: `/var/folders/lz/8qz9l_5n1fqgg0v6wp4ydmsm0000gn/T/TemporaryItems/NSIRD_screencaptureui_J2pA0Y/Screenshot 2026-07-15 at 10.43.33 AM.png`
- Shared concierge reference: `/var/folders/lz/8qz9l_5n1fqgg0v6wp4ydmsm0000gn/T/TemporaryItems/NSIRD_screencaptureui_TTSiIQ/Screenshot 2026-07-15 at 9.41.27 AM.png`
- Browser-rendered implementation: `/private/tmp/polynet-onboarding-qa-5bbb54fc/step3-agent-review-2048x1104.png`
- Full-view comparison: `/private/tmp/polynet-onboarding-qa-5bbb54fc/design-qa-comparison.png`
- Additional responsive evidence: `/private/tmp/polynet-onboarding-qa-5bbb54fc/step3-agent-review-900x900.png`, `/private/tmp/polynet-onboarding-qa-5bbb54fc/step3-agent-review-390x844.png`
- Primary viewport: `2048 × 1104`
- State: onboarding preview, step 3 agent-turn review, after a real account-scoped personal-agent response

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: the step-three guidance now uses the same shared concierge type hierarchy, weights, line height, and transcript treatment as steps one and two.
- Spacing and layout rhythm: the concierge card and agent dock do not overlap at `2048 × 1104`, `900 × 900`, or `390 × 844`. The complete dock remains visible and the card aligns beside it on desktop and above it on the narrow layout.
- Colors and visual tokens: the card uses the established concierge surface and the dock keeps its existing purple personal-agent identity. The rest of the community remains shaded.
- Image quality and asset fidelity: the guidance uses the canonical community avatar through `CommunityAvatar`; no placeholder or recreated asset is introduced.
- Copy and content: the concierge clearly distinguishes itself from the personal agent, explains the seeded prompt, and changes to a short review message only after the personal-agent response completes.

## Interaction and accessibility evidence

- Advanced from orientation to the simulated first community post and then to the personal-agent step.
- Verified that the deterministic first question is seeded without a public community write.
- Sent the question through the builder's ordinary personal agent and received a completed response.
- Verified that `Next` appears only after the response completes.
- Verified that the full dock is readable, its transcript remains scrollable, and its Close and New conversation controls are disabled during the guided step.
- Verified reduced-motion support remains inherited from the shared concierge surface.
- Browser console errors checked: none.

## Focused-region comparison

A separate crop was unnecessary because the concierge card, dock header, transcript, response, composer, and spacing between the two surfaces are all legible in the matched `2048 × 1104` capture. The `900 × 900` and `390 × 844` captures provide focused breakpoint evidence for collision and stacking behavior.

## Comparison history

1. Source state: only the agent composer was visible above the shade; the dock header and transcript were deliberately re-dimmed, and the generic guidance card was visually disconnected.
2. Implementation state: the local dock masks were removed, the entire dock was raised above the global shade, the shared concierge surface replaced the bespoke card, and one safe prompt was seeded.
3. Post-fix evidence: no overlap, clipping, console error, or P0/P1/P2 visual mismatch was found across the three tested viewports.

## Implementation checklist

- [x] Reuse the shared deterministic concierge presentation.
- [x] Keep the complete personal-agent dock visible.
- [x] Preserve a restrained composer focus treatment.
- [x] Seed one focused question without overwriting member input.
- [x] Lock disruptive dock controls during onboarding.
- [x] Wait for the personal-agent response before revealing `Next`.
- [x] Verify desktop and narrow layouts.

## Follow-up polish

No blocking or necessary follow-up polish remains for this slice.

final result: passed
