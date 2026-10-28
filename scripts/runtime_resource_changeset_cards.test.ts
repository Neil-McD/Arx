import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  buildResourceChangesetCardFromPayload,
  extractRuntimeResourceChangesetCards,
  isResourceProposalCompleted,
} from "../apps/web/src/components/RuntimeResourceChangesetApprovalCards.tsx";

describe("resource changeset approval cards", () => {
  it("dismisses recovered proposals only after confirmed application or rejection", () => {
    expect(isResourceProposalCompleted("applied")).toBe(true);
    expect(isResourceProposalCompleted("rejected")).toBe(true);
    for (const status of [null, "staged", "approved", "applying", "rejecting", "failed", "expired"]) {
      expect(isResourceProposalCompleted(status)).toBe(false);
    }
  });
  it("uses pending-only presentation for recovered proposals, not historical cards", () => {
    const source = readFileSync(new URL("../apps/web/src/components/WebCommunityAgentDock.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/cards=\{persistentResourceChangesetCards\}[\s\S]*?pendingOnly/);
  });
  it("extracts a staged changeset from the canonical polynet_write envelope", () => {
    const cards = extractRuntimeResourceChangesetCards([
      {
        seq: 7,
        event_type: "tool_call_finished",
        payload: {
          success: true,
          tool_name: "polynet_write",
          output_preview: JSON.stringify({
            ok: true,
            ref: "changeset-1",
            result: {
              kind: "community_resource_builder_changeset_staged",
              changeset_id: "changeset-1",
              community_id: "community-1",
              summary: "Draft the first Resources structure.",
              operation_count: 3,
              warning_count: 0,
              preview_items: [
                { marker: "+", title: "Start here", preview: "Draft page" },
              ],
            },
          }),
        },
      } as any,
    ]);

    expect(cards).toEqual([
      expect.objectContaining({
        changesetId: "changeset-1",
        communityId: "community-1",
        operationCount: 3,
        summary: "Draft the first Resources structure.",
      }),
    ]);
  });

  it("removes a staged card after a canonical terminal operation", () => {
    const staged = {
      kind: "community_resource_builder_changeset_staged",
      changeset_id: "changeset-2",
      community_id: "community-1",
      summary: "Draft Resources.",
      operation_count: 1,
    };
    const applied = {
      kind: "community_resource_builder_changeset_applied",
      changeset_id: "changeset-2",
      community_id: "community-1",
      status: "applied",
    };
    const cards = extractRuntimeResourceChangesetCards([
      {
        seq: 1,
        event_type: "tool_call_finished",
        payload: {
          success: true,
          tool_name: "polynet_write",
          output_preview: JSON.stringify({ result: staged }),
        },
      } as any,
      {
        seq: 2,
        event_type: "tool_call_finished",
        payload: {
          success: true,
          tool_name: "polynet_call",
          output_preview: JSON.stringify({ result: applied }),
        },
      } as any,
    ]);

    expect(cards).toEqual([]);
  });

  it("builds the same card model from a recovered pending row", () => {
    expect(
      buildResourceChangesetCardFromPayload({
        kind: "community_resource_builder_changeset_pending",
        changeset_id: "changeset-3",
        community_id: "community-1",
        summary: "Recovered proposal.",
        operation_count: 2,
        warning_count: 1,
        preview_items: [{ marker: "+", title: "Guide" }],
      }, 12),
    ).toEqual(
      expect.objectContaining({
        changesetId: "changeset-3",
        communityId: "community-1",
        operationCount: 2,
        warningCount: 1,
        seq: 12,
      }),
    );
  });
});
