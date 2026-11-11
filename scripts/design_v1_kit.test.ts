import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const root = new URL("../", import.meta.url);
const kitCss = readFileSync(new URL("apps/web/src/v1/kit.module.css", root), "utf8");

test("the kit's stylesheet is exactly the converted mock (no hand edits, no drift)", () => {
  const fresh = execFileSync("python3", ["scripts/design/build_v1_kit_css.py", "--stdout"], {
    cwd: root,
    encoding: "utf8",
  });
  expect(kitCss).toBe(fresh);
});

test("nothing in the kit's stylesheet can style the rest of the app", () => {
  const rules = kitCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors: string[] = [];
  const walk = (text: string) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open === -1) break;
      const head = text.slice(i, open).trim();
      let depth = 0;
      let j = open;
      for (; j < text.length; j++) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}" && --depth === 0) break;
      }
      const body = text.slice(open + 1, j);
      if (head.startsWith("@media") || head.startsWith("@supports")) walk(body);
      else if (!head.startsWith("@")) selectors.push(head);
      i = j + 1;
    }
  };
  walk(rules);
  expect(selectors.length).toBeGreaterThan(300);
  for (const head of selectors) {
    for (const selector of head.split(/,(?![^(]*\))/)) {
      // Every selector is anchored on the kit's root, a module class.
      expect(selector.trim(), head).toMatch(/^(:where\()?\.app\b/);
    }
  }
});

test("the design lab is reachable only on design v1 builds", () => {
  const main = readFileSync(new URL("apps/web/src/main.tsx", root), "utf8");
  expect(main).toMatch(/document\.documentElement\.dataset\.design === "v1" && window\.location\.pathname === "\/design-lab"/);
  expect(main).toMatch(/React\.lazy\(\(\) => import\("\.\/v1\/DesignLab"\)/);
});
