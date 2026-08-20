# Community shell reference experiment — design QA

final result: passed

## Evidence

- Source: `/Users/neilmcdevitt/Desktop/ChatGPT Image Aug 20, 2026, 04_09_20 PM.png`
- Populated implementation: `https://polynet-staging.vercel.app/c/polynet/chat`
- Final screenshot: `/Users/neilmcdevitt/.codex/visualizations/2026/08/20/01a020dc-2c0a-70b2-bdd6-d7d3440385b9/polynet-reference-shell-audit/04-final-staged-reference-shell.png`
- Staging build: `3b06a5291f90d461cfe482acabebc6ddbf039bca`

## Visible comparison

- P0: none.
- P1 resolved: global rail, community navigation, conversation, and context now read as independent framed surfaces.
- P1 resolved: the community identity uses the real avatar, banner, name, one-liner, and canonical settings action.
- P1 resolved: pinned content no longer lets rich media dominate the conversation viewport.
- P1 resolved: the right rail presents real memory and a bounded five-member preview with working canonical destinations.
- P2 resolved: banner and memory proportions were increased after the first staged comparison.
- Intentional difference: the reference's decorative three-agent roster was not implemented because Polynet does not currently have three truthful active community agents to show.
- Intentional difference: staging renders its real communities, messages, member count, roles, and visual identity rather than the reference image's illustrative data.

## Interaction checks

- `View all` opens the complete canonical members page.
- `Explore memory` opens the full canonical community memory surface.
- Existing channel, Resources, Events, invite, community settings, global settings, message composer, and member-agent controls remain available.
- No Convex schema, data, or deployment changed in this UI-only experiment.
