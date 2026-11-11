import { expect, test } from "vitest";
import { isGuideSearchShortcut } from "../apps/web/src/components/guideSearch";

test("⌘K (or Ctrl+K) opens your guide; other keys and chords don't", () => {
  const key = (k: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) =>
    ({ key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });
  expect(isGuideSearchShortcut(key("k", { metaKey: true }))).toBe(true);
  expect(isGuideSearchShortcut(key("K", { ctrlKey: true }))).toBe(true);
  expect(isGuideSearchShortcut(key("k"))).toBe(false);
  expect(isGuideSearchShortcut(key("k", { metaKey: true, shiftKey: true }))).toBe(false);
  expect(isGuideSearchShortcut(key("j", { metaKey: true }))).toBe(false);
});
