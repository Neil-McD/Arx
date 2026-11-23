import { expect, test } from "vitest";
import { getAvatarColor, getInitials } from "../shared/chatUi";

test("avatars always use the six theme tints and one initial", () => {
  const tint = getAvatarColor("user-123");
  expect(tint).toMatch(/^var\(--avatar-tint-[1-6]\)$/);
  // The same person always gets the same tint.
  expect(getAvatarColor("user-123")).toBe(tint);
  expect(getInitials("Lena Wolf")).toBe("L");
  expect(getInitials("  jon")).toBe("J");
});
