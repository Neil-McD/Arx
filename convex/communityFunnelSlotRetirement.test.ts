import { describe, expect, it } from "vitest";

import { resolveCommunityFunnelSlotCollapse } from "./communityFunnelSlotRetirement";

const content = (headline: string) => ({
  version: 2 as const,
  headline,
  subheadline: "A complete bounded funnel.",
  pillars: [
    { title: "Think", body: "Share context." },
    { title: "Remember", body: "Keep what matters." },
    { title: "Act", body: "Move together." },
  ],
  long_form_markdown: "## Built together\n\nA substantive canonical narrative.",
});

const row = (overrides: Record<string, unknown>) => ({
  _id: String(overrides._id ?? "row"),
  communityId: "community",
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

describe("community funnel slot retirement", () => {
  it("preserves the active published snapshot while carrying forward the newest valid draft", () => {
    const first = row({
      _id: "first",
      slot: "custom_1",
      draftContentV2: content("Newest draft"),
      draftRevision: 8,
      draftUpdatedAt: 800,
      updatedAt: 800,
    });
    const second = row({
      _id: "second",
      slot: "custom_2",
      publishedContentV2: content("Live snapshot"),
      publishedDraftRevision: 3,
      publishedAt: 300,
      updatedAt: 300,
    });
    const collapse = resolveCommunityFunnelSlotCollapse(
      { activeFunnelSlot: "custom_2" },
      [first, second],
    );
    expect(collapse?.target._id).toBe("second");
    expect(collapse?.patch).toMatchObject({
      liveMode: "custom",
      draftRevision: 8,
      draftContentV2: content("Newest draft"),
      publishedDraftRevision: 3,
      publishedContentV2: content("Live snapshot"),
    });
    expect(collapse?.deleteIds).toEqual(["first"]);
  });

  it("keeps published content private when the historical selector is default", () => {
    const custom = row({
      _id: "custom",
      slot: "custom_1",
      draftContentV2: content("Draft"),
      publishedContentV2: content("Published"),
      updatedAt: 50,
    });
    const collapse = resolveCommunityFunnelSlotCollapse(
      { activeFunnelSlot: "default" },
      [custom],
    );
    expect(collapse?.patch.liveMode).toBe("default");
    expect(collapse?.patch.publishedContentV2).toEqual(content("Published"));
  });

  it("retains an already-canonical custom-live row", () => {
    const canonical = row({
      _id: "canonical",
      liveMode: "custom",
      publishedContentV2: content("Canonical"),
    });
    const collapse = resolveCommunityFunnelSlotCollapse({}, [canonical]);
    expect(collapse?.target._id).toBe("canonical");
    expect(collapse?.patch.liveMode).toBe("custom");
    expect(collapse?.deleteIds).toEqual([]);
  });

  it("strips V1-only state without inventing custom content", () => {
    const legacy = row({
      _id: "legacy",
      slot: "custom_1",
      draftDocumentV1: { version: 1 },
      publishedDocumentV1: { version: 1 },
    });
    const collapse = resolveCommunityFunnelSlotCollapse(
      { activeFunnelSlot: "custom_1" },
      [legacy],
    );
    expect(collapse?.patch).toMatchObject({ liveMode: "default" });
    expect(collapse?.patch.draftContentV2).toBeUndefined();
    expect(collapse?.patch.publishedContentV2).toBeUndefined();
    expect(collapse?.patch.draftDocumentV1).toBeUndefined();
    expect(collapse?.patch.publishedDocumentV1).toBeUndefined();
  });
});
