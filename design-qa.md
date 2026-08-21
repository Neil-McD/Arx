# Community shell reference cleanup — design QA

final result: blocked

## Comparison target

- Source visual truth: `/Users/neilmcdevitt/Desktop/ChatGPT Image Aug 20, 2026, 04_09_20 PM.png`
- Source pixels: `1448 x 1086`
- Pre-change staging evidence: `/Users/neilmcdevitt/.codex/visualizations/2026/08/20/01a020dc-2c0a-70b2-bdd6-d7d3440385b9/polynet-shell-cleanup-audit/01-current-staging.png`
- Pre-change staging pixels: `2354 x 1600`
- Intended state: authenticated desktop `/c/polynet/chat`, dark theme, populated community
- Density normalization: compare proportions and focused regions rather than raw pixels because the supplied screenshots use different output densities and viewports.

## Current iteration

### Earlier P1 findings

- Community identity and banner rendered as two stacked blocks.
- Funnel one-liner leaked into the in-product banner.
- Neutral charcoal surfaces missed the reference's deep navy material system.
- Selected channel used a large gray pill instead of the narrow magenta accent.

### Fixes made

- Integrated the canonical community identity over a single edge-to-edge banner.
- Removed one-liner rendering from the in-product community navigation.
- Scoped the reference navy, warm-white, blue-gray stroke, and magenta accent tokens to the desktop community shell.
- Tightened the rail, navigation controls, channel header, pinned region, memory preview, and member rows.
- Added a contract proof preventing the stacked banner copy and selection treatment from returning.

## Verification completed

- Contract proof: passed.
- Community interaction projection proof: passed.
- Production web build: passed.
- Local browser render: shell framing and palette rendered, but authenticated content could not be verified because the local origin could not complete the existing staging session.

## Blocking gate

Deploy this exact web-only candidate to the staging Git/Vercel lane, capture the authenticated populated route at the same desktop state, compare it together with the source image, check primary interactions and console errors, then replace this blocker with the final browser evidence.
