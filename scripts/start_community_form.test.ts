import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

import { startCommunityListingLine } from "../apps/web/src/v1/KitStartCommunity";

// Start a community (design v1): two things to type, the address made from
// the name, and the card Discover will show beside them.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the preview says whether it is ready to be listed, or what is missing", () => {
  expect(startCommunityListingLine({ hasBanner: true, oneLiner: "Early climbers." })).toBe("Ready to be listed in Discover once you publish it.");
  expect(startCommunityListingLine({ hasBanner: false, oneLiner: "Early climbers." })).toBe("Add a banner to appear in Discover. You can do that later.");
  expect(startCommunityListingLine({ hasBanner: false, oneLiner: " " })).toBe("Add a banner and a one-liner to appear in Discover. You can do that later.");
});

test("the new form asks for the name and one line, and keeps the address out of the way until it is wrong or asked for", () => {
  const form = read("apps/web/src/v1/KitStartCommunity.tsx");
  expect(form).toContain("<span>Name</span>");
  expect(form).toContain("<span>Who it's for, in one line</span>");
  expect(form).toMatch(/editingAddress \|\| \(props\.slug\.length > 0 && !slugOk\)/);
  expect(form).toContain("const canCreate = !busy && props.name.trim().length > 0 && slugOk;");
  // The same card Discover draws.
  expect(form).toContain("<DiscoverCard now={Date.now()} community={{");
});

test("design v1 draws the new form in the same blocking modal; the classic form stays", () => {
  const modal = read("apps/web/src/components/WebCreateCommunityModal.tsx");
  expect(modal).toMatch(/if \(isDesignV1Active\(\)\) \{[\s\S]*?<KitStartCommunity/);
  expect(modal).toContain("Set up your community");
});

test("the dialog's Tab stops leave out anything inside an inert part", () => {
  const modal = readFileSync(new URL("../apps/web/src/components/WebBlockingSetupModal.tsx", import.meta.url), "utf8");
  expect(modal).toContain('.filter((element) => !element.closest("[inert]"))');
});
