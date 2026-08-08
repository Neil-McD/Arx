# Polynet responsive community banner design QA

## Visual target

- Preserve the established `2.84 / 1` banner ratio while the community navigation has room.
- Once the navigation contracts below 280px, preserve the threshold banner height and allow only the horizontal footprint to narrow.
- Keep artwork undistorted by using the existing `StableFramedMedia` cover frame and saved focal point.

## Rendered implementation

- Staging build: `24341c76d96229f52fcedc0cc5702d80f055c2a9`
- URL: `https://polynet-staging.vercel.app/c/polynet/chat`
- Signed-in browser QA at DPR 2:
  - 168px navigation -> 167px banner width x 98.59px banner height.
  - 218.4px navigation -> 217.4px banner width x 98.59px banner height.
- Both narrow widths computed `aspect-ratio: auto`; the height remained invariant while the width changed.
- The framed image retained its intrinsic scaling and extended beyond the banner width, proving horizontal crop rather than image distortion.

## Interaction regression review

- Community name, settings action, selected channel, shell seams, and composer remained aligned.
- Communities without banners remain unaffected and reserve no banner space.
- Memory opened as one right-side drawer without URL navigation.
- Drawer focus moved to `Back to community`; Escape closed it and restored focus to `Open community memory`.

Final result: passed.
