import { describe, expect, it } from "vitest";

import type { CommunityInteractionRootBundle } from "../shared/cloudCommunityInteractionsGateway";
import {
  communityInteractionRootHasRichContent,
  resolveSelectedCommunityInteractionRoot,
} from "../apps/web/src/components/WebCommunityInteractionProjection";

function bundle(id: string, contentSummary: string): CommunityInteractionRootBundle {
  return {
    root: {
      id,
      content_summary: contentSummary,
    },
    attachments: [],
    embeds: [],
  } as CommunityInteractionRootBundle;
}

describe("pinned community root selection", () => {
  it("opens a pinned root that is older than the loaded feed window", () => {
    const pinned = bundle("old-pinned-root", "Pinned outside the first page");

    expect(resolveSelectedCommunityInteractionRoot(
      [bundle("loaded-root", "Loaded")],
      null,
      pinned,
      pinned.root.id,
    )).toBe(pinned);
  });

  it("prefers the live feed bundle when the pinned root is already loaded", () => {
    const loaded = bundle("shared-root", "Newest live feed bundle");
    const pinned = bundle("shared-root", "Earlier pin subscription bundle");

    expect(resolveSelectedCommunityInteractionRoot([loaded], null, pinned, loaded.root.id)).toBe(loaded);
  });

  it("keeps an authorized selected root open after it is no longer pinned", () => {
    const selected = bundle("old-pinned-root", "Authorized root-by-id subscription");

    expect(resolveSelectedCommunityInteractionRoot([], selected, null, selected.root.id)).toBe(selected);
  });

  it("fails closed when the selected root is available from neither source", () => {
    expect(resolveSelectedCommunityInteractionRoot(
      [bundle("loaded-root", "Loaded")],
      null,
      bundle("pinned-root", "Pinned"),
      "missing-root",
    )).toBeNull();
  });

  it("only clamps body text when the root has real media or a renderable preview", () => {
    const textOnly = bundle("text", "Text only");
    const attachment = bundle("attachment", "Attachment");
    attachment.attachments = [{ id: "file" }] as CommunityInteractionRootBundle["attachments"];
    const embed = bundle("embed", "Embed");
    embed.embeds = [{
      embed_kind: "link",
      status: "ready",
      source_url: "https://example.com/article",
      normalized_source_url: "https://example.com/article",
    }] as CommunityInteractionRootBundle["embeds"];
    const failedEmbed = bundle("failed-embed", "Failed embed");
    failedEmbed.embeds = [{
      embed_kind: "link",
      status: "failed",
      source_url: "https://example.com/article",
      normalized_source_url: "https://example.com/article",
    }] as CommunityInteractionRootBundle["embeds"];

    expect(communityInteractionRootHasRichContent(textOnly)).toBe(false);
    expect(communityInteractionRootHasRichContent(attachment)).toBe(true);
    expect(communityInteractionRootHasRichContent(embed)).toBe(true);
    expect(communityInteractionRootHasRichContent(failedEmbed)).toBe(true);
  });
});
