import { expect, test } from "vitest";

import {
  areEquivalentValues,
  reuseEquivalentValue,
} from "../shared/reuseEquivalentValue";
import { mergeUserProfileEntries } from "../shared/userProfileMerge";

test("reuses a deeply equivalent JSON snapshot", () => {
  const previous = [{ id: "a", nested: { online: true }, values: [1, 2] }];
  const next = [{ id: "a", nested: { online: true }, values: [1, 2] }];

  expect(areEquivalentValues(previous, next)).toBe(true);
  expect(reuseEquivalentValue(previous, next)).toBe(previous);
});

test("returns a changed snapshot", () => {
  const previous = [{ id: "a", online: true }];
  const next = [{ id: "a", online: false }];

  expect(reuseEquivalentValue(previous, next)).toBe(next);
});

test("profile hydration is a no-op when carried fields are unchanged", () => {
  const profile = { user_id: "user-a", display_name: "Neil", avatar_url: "avatar-a" };
  const previous = { "user-a": profile };
  const next = mergeUserProfileEntries(previous, [{ ...profile }]);

  expect(next).toBe(previous);
  expect(next["user-a"]).toBe(profile);
});
