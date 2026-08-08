# Polynet responsive community banner design QA

## Visual target

- Source: `/var/folders/lz/8qz9l_5n1fqgg0v6wp4ydmsm0000gn/T/TemporaryItems/NSIRD_screencaptureui_mjetYb/Screenshot 2026-08-08 at 1.36.52 AM.png`
- Intent: preserve the established banner ratio at ordinary navigation widths, then progressively reduce banner height when the community navigation becomes narrow.

## Rendered implementation

- Staging build: `5aa69a58b1c756208663185ad988a8f280c2695e`
- URL: `https://polynet-staging.vercel.app/c/polynet/chat`
- Browser viewport: `1075 x 763` CSS pixels at DPR 2.
- Measured community navigation: `215 x 745` CSS pixels.
- Measured banner: `214 x 57.4` CSS pixels with computed `aspect-ratio: auto`.
- Evidence: `/Users/neilmcdevitt/.codex/visualizations/2026/08/08/polynet-banner-responsive/staging-narrow.png`
- Side-by-side comparison: `/Users/neilmcdevitt/.codex/visualizations/2026/08/08/polynet-banner-responsive/comparison-narrow.png`

## Design review

- The narrow banner is visibly shallower and gives the channel list more vertical room.
- The identity title, settings action, selected channel, shell seams, and adjacent feed remain aligned.
- The saved focal point remains centered and the image is cover-cropped by `StableFramedMedia`; the artwork is not stretched.
- Navigation widths above 280px retain the existing `2.84 / 1` aspect ratio unchanged.
- Compression is progressive between 280px and the navigation floor rather than an abrupt alternate banner size.
- Communities without banners remain unaffected and reserve no empty banner space.

final result: passed
