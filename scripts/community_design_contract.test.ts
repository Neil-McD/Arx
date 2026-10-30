import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { COMMUNITY_DESIGN_SURFACES, describeCommunityDesignContract } from "../shared/communityDesignContract";
import { DEFAULT_COMMUNITY_THEME, communityThemeVariables } from "../shared/communityTheme";

// Polynet's side of the design contract: a change to Polynet's components or
// styles must not drop a surface that community themes rely on.

const HOOKS_CSS = "apps/web/src/styles/community-theme-hooks.css";

function sourceFiles(dir: string, ext: RegExp): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && ext.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

const componentSource = [...sourceFiles("apps/web/src", /\.tsx$/), ...sourceFiles("shared", /\.tsx$/)]
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

function hasClass(name: string): boolean {
  return new RegExp(`["'\` ]${name}["'\` ]`).test(componentSource);
}

const contractClasses = new Set(Object.values(COMMUNITY_DESIGN_SURFACES).flatMap((surface) => surface.classes));

test("every class a theme styles is part of a listed surface", () => {
  const css = readFileSync(HOOKS_CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/url\([^)]*\)/g, "");
  const styled = new Set([...css.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((match) => match[1]));
  const unlisted = [...styled].filter((name) => !contractClasses.has(name));
  expect(unlisted, `Add these to COMMUNITY_DESIGN_SURFACES in shared/communityDesignContract.ts`).toEqual([]);
});

test("every surface still exists in Polynet's components", () => {
  const missing = Object.entries(COMMUNITY_DESIGN_SURFACES).flatMap(([surface, { classes }]) =>
    classes.filter((name) => !hasClass(name)).map((name) => `${surface}: .${name}`));
  expect(missing, "A component lost a class that community themes style. Rename it in the contract and the hooks file together").toEqual([]);
});

test("every theme variable Polynet's styles read is one the theme compiler sets", () => {
  const produced = new Set([
    ...Object.keys(communityThemeVariables(DEFAULT_COMMUNITY_THEME, "light")),
    ...Object.keys(communityThemeVariables(DEFAULT_COMMUNITY_THEME, "dark")),
  ]);
  const read = new Set(sourceFiles("apps/web/src/styles", /\.css$/)
    .flatMap((file) => [...readFileSync(file, "utf8").matchAll(/var\((--pn-[a-z0-9-]+)/g)].map((match) => match[1])));
  expect([...read].filter((name) => !produced.has(name))).toEqual([]);
});

test("surfaces only name real theme tokens", () => {
  const contract = describeCommunityDesignContract();
  const tokens = new Set(contract.theme.tokens);
  const unknown = Object.values(COMMUNITY_DESIGN_SURFACES).flatMap((surface) => surface.tokens.filter((token) => !tokens.has(token)));
  expect(unknown).toEqual([]);
  expect(contract.theme.colors).toEqual(["background", "surface", "text", "muted", "border", "accent", "on_accent", "button", "on_button"]);
});
