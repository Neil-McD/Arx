import assert from "node:assert/strict";

import { getNextSmoothStreamingText } from "../shared/smoothStreamingText.ts";

const target = `${"A deliberate streaming sentence. ".repeat(18)}Done.`;
let current = "";
let frames = 0;

while (current !== target && frames < 200) {
  const next = getNextSmoothStreamingText(current, target, {
    draining: true,
    reducedMotion: false,
  });
  assert.ok(next.startsWith(current), "streaming display must only append");
  assert.ok(target.startsWith(next), "streaming display must stay within target");
  assert.notEqual(next, current, "each drain frame must make progress");
  current = next;
  frames += 1;
}

assert.equal(current, target, "bounded drain must reach the final text");
assert.ok(frames >= 40, "a medium buffered answer must remain visibly progressive");
assert.ok(frames < 160, "the UI drain must remain bounded");
assert.equal(
  getNextSmoothStreamingText("", target, { reducedMotion: true }),
  target,
  "reduced motion must skip progressive reveal",
);
assert.equal(
  getNextSmoothStreamingText("old", "replacement", { draining: true }),
  "replacement",
  "authoritative non-prefix replacements must apply immediately",
);

console.log(`smooth streaming text contract proof passed (${frames} frames)`);
