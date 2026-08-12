import assert from "node:assert/strict";
import {
  MOBILE_READING_MODE_POLICY,
  advanceMobileReadingMode,
  beginMobileReadingModeGesture,
  createMobileReadingModeState,
  forceMobileReadingMode,
  settleMobileReadingMode,
  suppressProgrammaticMobileScroll,
  type MobileReadingModeState,
} from "../apps/web/src/components/mobileReadingModePolicy.ts";

function advance(
  state: MobileReadingModeState,
  scrollTop: number,
  nowMs: number,
  composerFocused = false,
  maxScrollTop = 1_000,
) {
  return advanceMobileReadingMode(state, {
    scrollTop,
    maxScrollTop,
    nowMs,
    composerFocused,
  });
}

{
  let state = createMobileReadingModeState();
  state = advance(state, 600, 0).state;
  state = beginMobileReadingModeGesture(state, 600, 1_000, 10);

  let result = advance(state, 580, 20);
  assert.equal(result.changed, false, "partial upward travel should not hide chrome");
  result = advance(result.state, 550, 30);
  assert.equal(result.changed, true, "deliberate upward travel should hide chrome");
  assert.equal(result.state.active, true);

  state = result.state;
  result = advance(state, 554, 40);
  assert.equal(result.changed, false, "tiny reversal should not reveal chrome");
  result = advance(result.state, 558, 50);
  assert.equal(result.changed, true, "intentional reversal should reveal chrome in the same gesture");
  assert.equal(result.state.active, false);

  state = forceMobileReadingMode(result.state, true, 60).state;
  result = advance(state, 950, 70);
  state = result.state;
  assert.equal(result.changed, true, "entering the bottom zone should restore chrome immediately");
  assert.equal(state.bottomLocked, true);
  assert.equal(state.active, false);

  result = settleMobileReadingMode(state, {
    scrollTop: 1_000,
    maxScrollTop: 1_000,
    nowMs: 620,
    composerFocused: false,
  });
  assert.equal(result.changed, false, "settling should preserve already-visible chrome");
  assert.equal(result.state.active, false);
}

{
  let state = createMobileReadingModeState();
  state = advance(state, 600, 0).state;
  state = beginMobileReadingModeGesture(state, 600, 1_000, 10);
  for (const [scrollTop, nowMs] of [[599, 20], [600, 30], [598.5, 40]] as const) {
    state = advance(state, scrollTop, nowMs).state;
  }
  assert.equal(state.active, false, "sub-threshold jitter should not change chrome state");
  assert.equal(
    state.directionAnchorScrollTop,
    600,
    "sub-threshold travel should keep one stable direction anchor",
  );
}

{
  let state = createMobileReadingModeState();
  state = advance(state, 600, 0).state;
  state = beginMobileReadingModeGesture(state, 600, 1_000, 10);
  let changes = 0;
  for (const [scrollTop, nowMs] of [
    [560, 20],
    [565, 40],
    [534, 60],
    [539, 80],
  ] as const) {
    const result = advance(state, scrollTop, nowMs);
    state = result.state;
    if (result.changed) changes += 1;
  }
  assert.equal(changes, 1, "sub-threshold reversals should not make chrome flicker");
  assert.equal(state.active, true, "the deliberate upward gesture should finish hidden");

  state = settleMobileReadingMode(state, {
    scrollTop: 539,
    maxScrollTop: 1_000,
    nowMs: 400,
    composerFocused: false,
  }).state;
  state = forceMobileReadingMode(state, false, 480).state;
  state = beginMobileReadingModeGesture(state, 539, 1_000, 500);
  const nextGesture = advance(state, 503, 520);
  assert.equal(nextGesture.changed, true, "a new deliberate upward gesture should hide chrome");
  assert.equal(nextGesture.state.active, true);
}

{
  let state = createMobileReadingModeState();
  state = advance(state, 0, 0).state;
  state = beginMobileReadingModeGesture(state, 0, 1_000, 10);
  state = advance(state, -80, 20).state;
  assert.equal(state.lastScrollTop, 0, "negative rubber-band scroll should clamp to zero");
  assert.equal(
    state.directionAnchorScrollTop,
    null,
    "rubber-band overscroll should not create directional travel",
  );
}

{
  let state = createMobileReadingModeState();
  state = advance(state, 920, 0).state;
  assert.equal(state.bottomLocked, true, "the bottom zone should force visible chrome");
  state = advance(state, 860, 20).state;
  assert.equal(
    state.bottomLocked,
    true,
    "bottom lock should survive movement inside the wider exit boundary",
  );
  state = advance(state, 830, 40).state;
  assert.equal(state.bottomLocked, false, "bottom lock should release beyond its exit boundary");
  assert.ok(
    MOBILE_READING_MODE_POLICY.bottomLockExitPx
      > MOBILE_READING_MODE_POLICY.bottomLockEnterPx,
    "bottom lock must use separate enter and exit boundaries",
  );
}

{
  let state = forceMobileReadingMode(createMobileReadingModeState(), true, 0).state;
  let result = suppressProgrammaticMobileScroll(state, 300, 80, false);
  state = result.state;
  result = advance(state, 1_000, 320);
  assert.equal(result.changed, false, "programmatic anchor movement must not toggle chrome");
  assert.equal(result.state.active, true);

  result = suppressProgrammaticMobileScroll(result.state, 400, 80, true);
  assert.equal(result.changed, true, "explicit programmatic follow should restore chrome");
  assert.equal(result.state.active, false);
}

{
  let state = forceMobileReadingMode(createMobileReadingModeState(), true, 0).state;
  const result = advance(state, 500, 300, true);
  assert.equal(result.changed, true, "composer focus should restore visible chrome");
  assert.equal(result.state.active, false);
}

console.log("mobile reading mode policy proof: ok");
