import assert from "node:assert/strict";
import { getNextSmoothStreamingText } from "../shared/smoothStreamingText.ts";

function revealSteps(target: string, draining: boolean): string[] {
  const steps: string[] = [];
  let current = "";
  for (let index = 0; index < 200; index += 1) {
    const next = getNextSmoothStreamingText(current, target, { draining });
    assert.ok(target.startsWith(next), "stream reveal must stay on the target prefix");
    assert.ok(next.length >= current.length, "stream reveal must never move backwards");
    steps.push(next);
    current = next;
    if (current === target) return steps;
  }
  throw new Error("stream reveal did not converge");
}

const shortTarget = "I checked the runtime path and found the streaming state.";
const longTarget = `${shortTarget} ${"This sentence makes the backlog large enough to exercise the larger reveal budgets. ".repeat(20)}`;

const shortSteps = revealSteps(shortTarget, false);
assert.equal(shortSteps.at(-1), shortTarget);
assert.ok(shortSteps[0].length >= 5, "short streams should show visible token progress immediately");

const longNormalSteps = revealSteps(longTarget, false);
const longDrainSteps = revealSteps(longTarget, true);
assert.equal(longNormalSteps.at(-1), longTarget);
assert.equal(longDrainSteps.at(-1), longTarget);
assert.ok(
  longDrainSteps.length < longNormalSteps.length,
  "draining should finish in fewer frames than normal streaming",
);

const replacement = getNextSmoothStreamingText("abc", "xyz", {});
assert.equal(replacement, "xyz", "non-prefix updates should snap to the new target");

console.log("runtime streaming text proof passed");
