import { describe, expect, it } from "vitest";
import { knowledgeAttentionDot } from "../shared/knowledgeAttentionDot";

describe("the Knowledge dot", () => {
  it("is the quiet dot when something new was published for you", () => {
    expect(knowledgeAttentionDot({ indicators: { resources: true }, knowledgeOpen: false })).toBe(true);
  });

  it("is off when nothing in Knowledge is new", () => {
    expect(knowledgeAttentionDot({ indicators: { resources: false }, knowledgeOpen: false })).toBe(false);
  });

  it("is off while Knowledge is open (it is being read)", () => {
    expect(knowledgeAttentionDot({ indicators: { resources: true }, knowledgeOpen: true })).toBe(false);
  });

  it("treats a community with no attention row yet as nothing new", () => {
    expect(knowledgeAttentionDot({ indicators: undefined, knowledgeOpen: false })).toBe(false);
    expect(knowledgeAttentionDot({ indicators: {}, knowledgeOpen: false })).toBe(false);
  });
});
