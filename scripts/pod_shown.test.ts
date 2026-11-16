import { expect, test } from "vitest";

import { podShown } from "../apps/web/src/v1/podMemory";

// The Pods page shows the pod its address names, read from the address and
// the lists, never a pick stored by the page and never a redirect.
const base = { podSlug: null, mine: ["founders", "coaches"], outside: ["juniors"], recalled: null, wide: true, preview: false };

test("nothing is shown until the lists load, so a landing page never starts as a pitch", () => {
  expect(podShown({ ...base, podSlug: "founders", mine: null })).toBeNull();
});

test("/pods/<pod> shows your pod's landing page and another pod's pitch, on any width", () => {
  expect(podShown({ ...base, podSlug: "coaches" })).toEqual({ slug: "coaches", kind: "landing" });
  expect(podShown({ ...base, podSlug: "juniors" })).toEqual({ slug: "juniors", kind: "pitch" });
  expect(podShown({ ...base, podSlug: "coaches", wide: false })).toEqual({ slug: "coaches", kind: "landing" });
});

test("a builder who asked to see it as members do gets the pitch", () => {
  expect(podShown({ ...base, podSlug: "founders", preview: true })).toEqual({ slug: "founders", kind: "pitch" });
});

test("/pods on a wide screen shows the pod you were last in, else your first, else one to join", () => {
  expect(podShown({ ...base, recalled: "coaches" })).toEqual({ slug: "coaches", kind: "landing" });
  expect(podShown({ ...base, recalled: "gone" })).toEqual({ slug: "founders", kind: "landing" });
  expect(podShown({ ...base, mine: [] })).toEqual({ slug: "juniors", kind: "pitch" });
  expect(podShown({ ...base, mine: [], outside: [] })).toBeNull();
});

test("/pods on a narrow screen is just the list", () => {
  expect(podShown({ ...base, wide: false, recalled: "coaches" })).toBeNull();
});
