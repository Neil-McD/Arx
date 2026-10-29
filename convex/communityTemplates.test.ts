import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { normalizeCommunityLayout } from "../shared/communityLayout";
import { normalizeCommunityTheme } from "../shared/communityTheme";

// Every CLI template must ship a theme the validator accepts as-is, so
// `polynet init --template <name>` never starts a founder on a broken look.
const TEMPLATES_DIR = join(__dirname, "..", "packages", "polynet-cli", "templates");

const templateNames = readdirSync(TEMPLATES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

function readJson(name: string, file: string): unknown {
  return JSON.parse(readFileSync(join(TEMPLATES_DIR, name, file), "utf8"));
}

describe("CLI community templates", () => {
  test("the classroom template exists", () => {
    expect(templateNames).toContain("classroom");
  });

  test.each(templateNames)("%s has a template.json naming itself", (name) => {
    const manifest = readJson(name, "template.json") as Record<string, unknown>;
    expect(manifest.name).toBe(name);
    expect(typeof manifest.label).toBe("string");
    expect(typeof manifest.description).toBe("string");
    expect(manifest.contract).toBe(1);
  });

  test.each(templateNames)("%s theme passes the theme validator unchanged", (name) => {
    const raw = readJson(name, "theme.json");
    const result = normalizeCommunityTheme(raw);
    if (!result.ok) throw new Error(JSON.stringify(result.problems, null, 2));
  });
});

const layoutTemplateNames = templateNames.filter((name) => existsSync(join(TEMPLATES_DIR, name, "layout.json")));

describe("template apply rules", () => {
  // A founder who picks a layout template keeps their own colours and fonts.
  test.each(layoutTemplateNames)("%s keeps a community's existing theme", (name) => {
    const manifest = readJson(name, "template.json") as { apply?: { theme?: string } };
    expect(manifest.apply?.theme).toBe("keep_existing");
  });
});

describe("classroom template scope", () => {
  // Only blocks backed by a system Polynet already has (posts, resources,
  // events, members, funnel, agent). No points, levels or map.
  test("asks for no block Polynet has no system for", () => {
    const text = readFileSync(join(TEMPLATES_DIR, "classroom", "template.json"), "utf8");
    expect(text).not.toMatch(/leaderboard|level|points|map"/i);
  });
});

describe("template layouts", () => {
  test.each(layoutTemplateNames)("%s layout passes the layout validator", (name) => {
    const result = normalizeCommunityLayout(readJson(name, "layout.json"));
    if (!result.ok) throw new Error(JSON.stringify(result.problems, null, 2));
  });
});
