import { describe, expect, it } from "vitest";
import { readKnowledgeDraft } from "../apps/web/src/v1/KitKnowledgeList";

describe("what Knowledge's add box holds", () => {
  it("is nothing while empty", () => {
    expect(readKnowledgeDraft("  \n ")).toBeNull();
  });
  it("reads lines of links as links", () => {
    expect(readKnowledgeDraft("https://a.example/guide\n http://b.example ")).toEqual({ kind: "links", links: ["https://a.example/guide", "http://b.example"] });
  });
  it("treats a link inside a sentence as a note", () => {
    expect(readKnowledgeDraft("See https://a.example for more")?.kind).toBe("note");
  });
  it("uses a short first line as the note's title", () => {
    expect(readKnowledgeDraft("Office hours\nThursdays at 4pm Eastern.")).toEqual({ kind: "note", title: "Office hours", text: "Thursdays at 4pm Eastern." });
  });
  it("names a one-line note by how it starts and keeps every word", () => {
    const line = "Office hours are Thursdays at 4pm Eastern in General, and you should bring one client.";
    const draft = readKnowledgeDraft(line);
    expect(draft).toMatchObject({ kind: "note", text: line });
    expect(draft && draft.kind === "note" && draft.title.length).toBeLessThanOrEqual(60);
  });
});
