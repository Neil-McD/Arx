import { describe, expect, it } from "vitest";

import {
  communityFunnelDraftAdvanced,
  communityFunnelTurnPostconditionPassed,
  isCommunityFunnelDraftWriteReceiptEvent,
  readCommunityFunnelDraftAuthoritySnapshot,
} from "../shared/communityFunnelTurnPostcondition";

describe("community funnel turn postcondition", () => {
  it("passes only when the selected slot gains content at a higher revision", () => {
    const before = readCommunityFunnelDraftAuthoritySnapshot(
      { custom_funnels: { custom_1: null, custom_2: null } },
      "custom_1",
    );
    const after = readCommunityFunnelDraftAuthoritySnapshot(
      {
        custom_funnels: {
          custom_1: {
            slot: "custom_1",
            draft_revision: 1,
            draft_content_v2: {
              version: 2,
              headline: "A real draft",
              subheadline: "Saved by the bounded composer.",
              pillars: [
                { title: "One", body: "One body" },
                { title: "Two", body: "Two body" },
                { title: "Three", body: "Three body" },
              ],
              long_form_markdown: "A substantive narrative.",
            },
          },
          custom_2: null,
        },
      },
      "custom_1",
    );

    expect(communityFunnelDraftAdvanced({ before, after })).toBe(true);
  });

  it("rejects prose-only success and unchanged revisions", () => {
    const snapshot = { draftRevision: 1, hasDraftContent: true };
    expect(
      communityFunnelDraftAdvanced({ before: snapshot, after: snapshot }),
    ).toBe(false);
    expect(
      communityFunnelDraftAdvanced({
        before: { draftRevision: 0, hasDraftContent: false },
        after: { draftRevision: 1, hasDraftContent: false },
      }),
    ).toBe(false);
  });

  it("requires a successful write receipt from this turn as well as authority advancement", () => {
    const before = { draftRevision: 1, hasDraftContent: true };
    const after = { draftRevision: 2, hasDraftContent: true };
    expect(
      communityFunnelTurnPostconditionPassed({
        before,
        after,
        writeReceiptObserved: false,
      }),
    ).toBe(false);
    expect(
      communityFunnelTurnPostconditionPassed({
        before,
        after,
        writeReceiptObserved: true,
      }),
    ).toBe(true);
  });

  it("recognizes only a successful bounded funnel draft tool receipt", () => {
    const receipt = {
      eventType: "tool_call_finished",
      payload: {
        tool_name: "polynet_call",
        success: true,
        args: { operation: "community.funnel.update_draft" },
      },
    };
    expect(isCommunityFunnelDraftWriteReceiptEvent(receipt)).toBe(true);
    expect(
      isCommunityFunnelDraftWriteReceiptEvent({
        ...receipt,
        payload: { ...receipt.payload, success: false },
      }),
    ).toBe(false);
    expect(
      isCommunityFunnelDraftWriteReceiptEvent({
        ...receipt,
        payload: {
          ...receipt.payload,
          args: { operation: "community.funnel.publish" },
        },
      }),
    ).toBe(false);
  });
});
