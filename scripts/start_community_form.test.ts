import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

import { discoverPriceWord } from "../apps/web/src/v1/KitDiscover";
import { startCardCommunity, startCommunityListingLine } from "../apps/web/src/v1/KitStartCommunity";

// Start a community (design v1): three steps in one window, with the card
// Discover will show beside each.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the preview says who can find it: unlisted, listed, or what listing still needs", () => {
  const full = { hasPicture: true, hasBanner: true, oneLiner: "Early climbers." };
  expect(startCommunityListingLine({ ...full, listed: false })).toBe("Unlisted: only people with your link can find it.");
  expect(startCommunityListingLine({ ...full, listed: true })).toBe("It will show in Discover like this.");
  expect(startCommunityListingLine({ ...full, listed: true, hasBanner: false })).toBe("Add a banner to be listed. Until then it stays unlisted.");
  expect(startCommunityListingLine({ listed: true, hasPicture: false, hasBanner: false, oneLiner: " " })).toBe("Add a picture, a banner and a one-liner to be listed. Until then it stays unlisted.");
});

test("the card shows the price once one is typed, and Free until then", () => {
  const facts = { slug: "kiln", name: "Kiln", oneLiner: "Potters.", avatarUrl: null, bannerUrl: null, hostName: "Maya", hostAvatarUrl: null };
  expect(discoverPriceWord(startCardCommunity({ ...facts, monthlyCents: null }))).toBe("Free");
  expect(discoverPriceWord(startCardCommunity({ ...facts, monthlyCents: 2900 }))).toBe("$29/month");
  expect(startCardCommunity({ ...facts, name: " ", oneLiner: "", monthlyCents: null })).toMatchObject({ name: "Your community", one_liner: "Who it's for, in one line." });
});

test("step 1 is the name, address and pictures; step 2 is the offer; the community is created on step 2", () => {
  const form = read("apps/web/src/v1/KitStartCommunity.tsx");
  const [first, second] = form.split("<h2 id={props.titleId}>What you're offering</h2>");
  expect(first).toContain("<span>Name</span>");
  expect(first).toContain("<span>Picture and banner <em>· optional</em></span>");
  expect(first).toContain("<Btn go disabled={!canGoOn} onClick={() => setStep(2)}>Next</Btn>");
  expect(first).not.toContain("Who it's for, in one line</span>");
  expect(first).toMatch(/editingAddress \|\| \(props\.slug\.length > 0 && !slugOk\)/);
  for (const field of ["<span>Who it's for, in one line</span>", "<span>What members get <em>· optional</em></span>", "<span>Price</span>", "<span>List it in Discover</span>"]) expect(second).toContain(field);
  expect(second).toContain("<Btn go disabled={!canGoOn || !priceOk} onClick={create}>");
  expect(second).toContain("onClick={() => setStep(1)}>Back</Btn>");
  // What step 2 asks for beyond the one-liner is saved once the community exists.
  expect(form).toMatch(/stashStartExtras\(props\.slug, \{ about: about\.trim\(\), listed, monthlyCents \}\);\s*void props\.onCreate\(\);/);
  // Every step: three dots, and the same card Discover draws.
  expect(form).toContain("{[1, 2, 3].map((dot) => <i key={dot} className={cx(dot === props.step && \"on\")} />)}");
  expect(form).toContain("<DiscoverCard now={Date.now()} community={startCardCommunity(props.card)} />");
});

test("step 3 gives the invite link and the way in", () => {
  const form = read("apps/web/src/v1/KitStartCommunity.tsx");
  expect(form).toContain("<StartStepFrame step={3}");
  expect(form).toContain("const link = `https://${communityPageAddress(props.card.slug)}`;");
  expect(form).toMatch(/<Btn go disabled=\{props\.saving \|\| props\.opening\} onClick=\{props\.onOpen\}>/);
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
