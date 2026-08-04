import { describe, expect, it } from "vitest";

import type { CommunityInteractionRootBundle } from "../shared/cloudCommunityInteractionsGateway";
import { resolveSelectedCommunityInteractionRoot } from "../apps/web/src/components/WebCommunityInteractionProjection";

function bundle(id: string, contentSummary: string): CommunityInteractionRootBundle {
  return {
    root: {
      id,
      content_summary: contentSummary,
    },
  } as CommunityInteractionRootBundle;
}

describe("pinned community root selection", () => {
  it("opens a pinned root that is older than the loaded feed window", () => {
    const pinned = bundle("old-pinned-root", "Pinned outside the first page");

    expect(resolveSelectedCommunityInteractionRoot(
      [bundle("loaded-root", "Loaded")],
      pinned,
      pinned.root.id,
    )).toBe(pinned);
  });

  it("prefers the live feed bundle when the pinned root is already loaded", () => {
    const loaded = bundle("shared-root", "Newest live feed bundle");
    const pinned = bundle("shared-root", "Earlier pin subscription bundle");

    expect(resolveSelectedCommunityInteractionRoot([loaded], pinned, loaded.root.id)).toBe(loaded);
  });

  it("fails closed when the selected root is available from neither source", () => {
    expect(resolveSelectedCommunityInteractionRoot(
      [bundle("loaded-root", "Loaded")],
      bundle("pinned-root", "Pinned"),
      "missing-root",
    )).toBeNull();
  });
});
