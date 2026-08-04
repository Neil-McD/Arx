import { describe, expect, it } from "vitest";
import { interactionReactionsVisible } from "../apps/web/src/components/communityInteractionFeed";

describe("pinned community interaction presentation", () => {
  it("suppresses reactions only when the projection opts out", () => {
    expect(interactionReactionsVisible(false)).toBe(false);
  });

  it("preserves reactions by default for every canonical post renderer", () => {
    expect(interactionReactionsVisible(undefined)).toBe(true);
    expect(interactionReactionsVisible(true)).toBe(true);
  });
});
