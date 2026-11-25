import { expect, test } from "vitest";
import {
  clearPlanOffer,
  readPlanOffer,
  rememberLandingPlanChoice,
  rememberPlanOffer,
  takeLandingPlanChoice,
} from "../shared/landingPlanChoice";

function memory() {
  const map = new Map<string, string>();
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value), removeItem: (key: string) => void map.delete(key) };
}
const NOW = 1_795_600_000_000;

test("a plan picked on the pricing section survives sign-in once, then is gone", () => {
  const store = memory();
  rememberLandingPlanChoice("chief_of_staff", NOW, store);
  expect(takeLandingPlanChoice(NOW + 60_000, store)).toBe("chief_of_staff");
  expect(takeLandingPlanChoice(NOW + 60_000, store)).toBeNull();
});

test("starting free, an old choice, or a garbled one means no plan is offered", () => {
  const store = memory();
  rememberLandingPlanChoice("guide", NOW, store);
  rememberLandingPlanChoice(null, NOW, store);
  expect(takeLandingPlanChoice(NOW, store)).toBeNull();
  rememberLandingPlanChoice("guide", NOW, store);
  expect(takeLandingPlanChoice(NOW + 3 * 60 * 60 * 1000, store)).toBeNull();
  store.setItem("polynet.landingPlanChoice", JSON.stringify({ tier: "platinum", at: NOW }));
  expect(takeLandingPlanChoice(NOW, store)).toBeNull();
  store.setItem("polynet.landingPlanChoice", "{not json");
  expect(takeLandingPlanChoice(NOW, store)).toBeNull();
});

test("the offer belongs to the community it was made for, until started or declined", () => {
  const store = memory();
  rememberPlanOffer("c1", "guide", store);
  expect(readPlanOffer("c1", store)).toBe("guide");
  expect(readPlanOffer("c2", store)).toBeNull();
  clearPlanOffer("c1", store);
  expect(readPlanOffer("c1", store)).toBeNull();
});

test("no storage at all is not an error", () => {
  rememberLandingPlanChoice("guide", NOW, null);
  expect(takeLandingPlanChoice(NOW, null)).toBeNull();
  rememberPlanOffer("c1", "guide", null);
  expect(readPlanOffer("c1", null)).toBeNull();
});
