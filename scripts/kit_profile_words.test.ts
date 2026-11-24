import { expect, test } from "vitest";
import { profileDay, profileLastHere, profileSubLine } from "../apps/web/src/v1/KitProfile";

const NOW = new Date("2026-11-24T15:00:00").getTime();

test("the line under a name says only what there is", () => {
  expect(profileSubLine({ handle: "@maya", here_now: true, you: false })).toBe("@maya · Here now");
  expect(profileSubLine({ handle: "maya", here_now: false, you: false })).toBe("@maya");
  expect(profileSubLine({ handle: null, here_now: false, you: false })).toBe("");
  // Your own profile says what it is, never that you are here.
  expect(profileSubLine({ handle: "maya", here_now: true, you: true })).toBe("@maya · This is what other members see");
});

test("the host block says days plainly", () => {
  expect(profileDay("2026-05-15T12:00:00", NOW)).toBe("May 15");
  expect(profileDay("2025-05-15T12:00:00", NOW)).toBe("May 15, 2025");
  expect(profileDay(null, NOW)).toBeNull();
  expect(profileLastHere("2026-11-24T01:00:00", NOW)).toBe("Today");
  expect(profileLastHere("2026-11-23T23:00:00", NOW)).toBe("Yesterday");
  expect(profileLastHere("2026-11-10T12:00:00", NOW)).toBe("Nov 10");
  expect(profileLastHere(null, NOW)).toBeNull();
});
