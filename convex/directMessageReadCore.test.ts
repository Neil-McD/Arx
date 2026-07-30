import { expect, test } from "vitest";

import {
  clampDirectMessageReadSeq,
  nextDirectMessageReadSeq,
  normalizeDirectMessageReadSeq,
} from "./directMessageReadCore";

test("DM read positions accept only positive committed sequence numbers", () => {
  expect(normalizeDirectMessageReadSeq(4.9)).toBe(4);
  expect(normalizeDirectMessageReadSeq(0)).toBe(0);
  expect(normalizeDirectMessageReadSeq(-1)).toBe(0);
  expect(normalizeDirectMessageReadSeq(Number.POSITIVE_INFINITY)).toBe(0);
  expect(normalizeDirectMessageReadSeq(undefined)).toBe(0);
});

test("future DM read positions clamp to the server-readable head", () => {
  expect(clampDirectMessageReadSeq(99, 6)).toBe(6);
  expect(clampDirectMessageReadSeq(5, 6)).toBe(5);
  expect(clampDirectMessageReadSeq(0, 6)).toBe(0);
});

test("a message arriving after render remains unread", () => {
  expect(nextDirectMessageReadSeq(4, 5, 6)).toBe(5);
});

test("stale and repeated DM acknowledgements cannot regress the cursor", () => {
  expect(nextDirectMessageReadSeq(5, 3, 6)).toBe(5);
  expect(nextDirectMessageReadSeq(5, 5, 6)).toBe(5);
  expect(nextDirectMessageReadSeq(5, 6, 6)).toBe(6);
});
