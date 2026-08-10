import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { resolveCommunityInteractionOverflowMenuPlacement } from "../apps/web/src/controllers/resolveCommunityInteractionOverflowMenuPlacement.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

assert.equal(
  resolveCommunityInteractionOverflowMenuPlacement({ top: 100, bottom: 136 }, 800),
  "below",
  "top-half triggers should open their overflow menu downward",
);
assert.equal(
  resolveCommunityInteractionOverflowMenuPlacement({ top: 664, bottom: 700 }, 800),
  "above",
  "bottom-half triggers should open their overflow menu upward",
);
assert.equal(
  resolveCommunityInteractionOverflowMenuPlacement({ top: 382, bottom: 418 }, 800),
  "above",
  "a trigger centered on the viewport midpoint should prefer the composer-safe upward placement",
);
assert.equal(
  resolveCommunityInteractionOverflowMenuPlacement({ top: Number.NaN, bottom: 36 }, 800),
  "below",
  "invalid geometry should fail to the stable default placement",
);

const feed = read("apps/web/src/components/communityInteractionFeed.tsx");
const styles = read("apps/web/src/styles/community-and-content.css");
const contract = read("docs/community-interaction-substrate-contract-v1.md");
const packageJson = read("package.json");

assert.match(
  feed,
  /triggerRef\.current[\s\S]*resolveCommunityInteractionOverflowMenuPlacement\([\s\S]*trigger\.getBoundingClientRect\(\)[\s\S]*window\.innerHeight/,
  "the live menu should resolve placement from current trigger and viewport geometry",
);
assert.match(
  feed,
  /window\.addEventListener\("resize", updatePlacement\)[\s\S]*window\.addEventListener\("scroll", updatePlacement, true\)/,
  "an open menu should keep placement current while the viewport or nested feed moves",
);
assert.match(
  feed,
  /aria-haspopup="menu"[\s\S]*aria-expanded=\{open\}[\s\S]*community-interaction-overflow-menu is-\$\{placement\}[\s\S]*data-placement=\{placement\}/,
  "the trigger and menu should expose their open and placement states",
);
assert.match(
  styles,
  /\.community-interaction-overflow-menu\.is-below\s*\{[^}]*top:\s*calc\(100% \+ 6px\);[^}]*bottom:\s*auto;/,
  "top-half menus should anchor beneath their trigger",
);
assert.match(
  styles,
  /\.community-interaction-overflow-menu\.is-above\s*\{[^}]*top:\s*auto;[^}]*bottom:\s*calc\(100% \+ 6px\);/,
  "bottom-half menus should anchor above their trigger",
);
assert.match(
  contract,
  /message overflow menus open below triggers in the top half of the viewport and above triggers in the bottom half/,
  "the interaction contract should state the adaptive placement rule",
);
assert.match(
  packageJson,
  /"check:community-interaction-overflow-menu-placement": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_interaction_overflow_menu_placement_contract_proof\.ts"/,
  "the focused placement proof should be callable from package scripts",
);

console.log("community_interaction_overflow_menu_placement_contract_proof: ok");
