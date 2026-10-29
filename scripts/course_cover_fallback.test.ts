import { expect, test } from "vitest";
import { courseCoverFallback } from "../shared/courseCoverFallback";

test("a cover-less course gets a stable look of its own and its first letter", () => {
  const first = courseCoverFallback("mod_a", "Start here");
  expect(courseCoverFallback("mod_a", "Start here")).toEqual(first);
  expect(first.initial).toBe("S");
  const looks = new Set(["mod_a", "mod_b", "mod_c", "mod_d", "mod_e"].map((id) => JSON.stringify(courseCoverFallback(id, "x").style)));
  expect(looks.size).toBeGreaterThan(1);
});

test("the letter skips leading symbols and emoji", () => {
  expect(courseCoverFallback("m", "  🚀 launch kit").initial).toBe("L");
  expect(courseCoverFallback("m", "#1 rule").initial).toBe("1");
  expect(courseCoverFallback("m", "").initial).toBe("");
});
