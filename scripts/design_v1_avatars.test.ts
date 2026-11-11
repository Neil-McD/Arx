import { afterEach, expect, test } from "vitest";
import { getAvatarColor, getInitials } from "../shared/chatUi";

const realDocument = (globalThis as any).document;
afterEach(() => { (globalThis as any).document = realDocument; });
const designV1 = (on: boolean) => {
  (globalThis as any).document = { documentElement: { dataset: on ? { design: "v1" } : {} } };
};

test("in design v1 avatars use the mock's six tints and one initial", () => {
  designV1(true);
  const tint = getAvatarColor("user-123");
  expect(tint).toMatch(/^var\(--avatar-tint-[1-6]\)$/);
  // The same person always gets the same tint.
  expect(getAvatarColor("user-123")).toBe(tint);
  expect(getInitials("Lena Wolf")).toBe("L");
  expect(getInitials("  jon")).toBe("J");
});

test("the default design keeps its colours and two letters", () => {
  designV1(false);
  expect(getAvatarColor("user-123")).toMatch(/^#[0-9a-f]{6}$/);
  expect(getInitials("Lena Wolf")).toBe("LE");
});
