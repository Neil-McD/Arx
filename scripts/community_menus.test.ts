import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { accountMenuRoleLine } from "../apps/web/src/components/WebAccountMenu";
import { communityMarkTone, SWITCHER_GROUPS_FROM, switcherGroups } from "../apps/web/src/v1/switcherList";

const read = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const many = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"].map((slug) => ({ id: slug, slug, name: `Community ${slug.toUpperCase()}` }));
const slugs = (list: Array<{ slug: string }>) => list.map((community) => community.slug);

test("a few communities are one list, the one you're in first", () => {
  const few = many.slice(0, 6);
  expect(SWITCHER_GROUPS_FROM).toBe(11);
  const groups = switcherGroups(few, "c", { e: 5 }, "");
  expect(groups.recent).toEqual([]);
  expect(slugs(groups.all)).toEqual(["c", "a", "b", "d", "e", "f"]);
});

test("many communities are Recent (here, then the two last opened) and All (the rest, in order)", () => {
  const groups = switcherGroups(many, "c", { c: 9, g: 7, a: 3, e: 8 }, "");
  expect(slugs(groups.recent)).toEqual(["c", "e", "g"]);
  expect(slugs(groups.all)).toEqual(["a", "b", "d", "f", "h", "i", "j", "k"]);
  // Nothing remembered yet: only where you are is recent.
  expect(slugs(switcherGroups(many, "c", {}, "").recent)).toEqual(["c"]);
});

test("searching is one list by name, with no groups", () => {
  const groups = switcherGroups(many, "c", { g: 7 }, " community G ");
  expect(groups.recent).toEqual([]);
  expect(slugs(groups.all)).toEqual(["g"]);
});

test("a community's colour is always the same for it", () => {
  expect(communityMarkTone("abc")).toBe(communityMarkTone("abc"));
  expect(communityMarkTone("abc")).toMatch(/^linear-gradient/);
});

test("the account menu's header says the role and where it holds", () => {
  expect(accountMenuRoleLine("Host", "Polynet")).toBe("Host of Polynet");
  expect(accountMenuRoleLine("Member", "Polynet")).toBe("Member of Polynet");
  expect(accountMenuRoleLine("Viewing as a member", "Polynet")).toBe("Viewing as a member");
  expect(accountMenuRoleLine("Host", null)).toBe("Host");
  expect(accountMenuRoleLine("", "Polynet")).toBe("");
});

test("the account menu is who you are, this community, you, then sign out", () => {
  const menu = read("apps/web/src/components/WebAccountMenu.tsx");
  const order = ["account-menu-head", ">This community<", '"Host view" : "View as a member"', ">You<", "<span>Settings</span>", "<span>Appearance</span>", "<span>Sign out</span>"].map((text) => menu.indexOf(text));
  expect(order.every((at) => at >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  // Appearance says the mode you're in, not the one you'd switch to.
  expect(menu).toContain('<span className="account-menu-fact">{isLight ? "Light" : "Dark"}</span>');
});
