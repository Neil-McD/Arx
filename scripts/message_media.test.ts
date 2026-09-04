// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isPdfDocument, pdfLinksInText, safeDocumentUrl } from "../shared/messagePdf";
import { communityInteractionRootHasRichContent } from "../apps/web/src/components/WebCommunityInteractionProjection";
import { youTubeEmbedsInText } from "../shared/linkEmbedUi";

describe("message documents", () => {
  it("recognizes PDF uploads by MIME or extension", () => {
    expect(isPdfDocument("uploaded-file", "application/pdf; charset=binary")).toBe(true);
    expect(isPdfDocument("GUIDE.PDF", "application/octet-stream")).toBe(true);
    expect(isPdfDocument("guide.pdf.exe", "text/plain")).toBe(false);
  });
  it("recognizes signed PDF links, skips code, and preserves the authorized URL", () => {
    const href = "https://files.example.com/My%20Guide.PDF?signature=example";
    expect(pdfLinksInText(`${href}\n${href}\n\`https://files.example.com/code.pdf\``)).toEqual([{ href, name: "My Guide.PDF" }]);
    expect(pdfLinksInText("https://files.example.com/page?name=guide.pdf")).toEqual([]);
  });
  it("rejects active, insecure, or credentialed URLs", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,test", "http://example.com/a.pdf", "https://user:pass@example.com/a.pdf"]) expect(safeDocumentUrl(url)).toBeNull();
  });
});

describe("media classification", () => {
  const bundle = (text: string) => ({
    attachments: [], content_blocks: [], root: { content_summary: text },
  }) as unknown as Parameters<typeof communityInteractionRootHasRichContent>[0];
  it("classifies pasted PDF and video posts consistently with rendering", () => {
    expect(communityInteractionRootHasRichContent(bundle("https://files.example.com/guide.pdf"))).toBe(true);
    expect(communityInteractionRootHasRichContent(bundle("https://youtu.be/M7lc1UVf-VE"))).toBe(true);
    expect(communityInteractionRootHasRichContent(bundle("https://example.com/page"))).toBe(false);
    expect(communityInteractionRootHasRichContent(bundle("`https://files.example.com/guide.pdf`"))).toBe(false);
  });
  it("bounds distinct videos and documents without removing authored links", () => {
    expect(youTubeEmbedsInText(Array.from({ length: 20 }, (_, i) => `https://youtu.be/video${String(i).padStart(6, "0")}`).join("\n"))).toHaveLength(12);
    expect(pdfLinksInText(Array.from({ length: 20 }, (_, i) => `https://files.example.com/${i}.pdf`).join("\n"))).toHaveLength(12);
  });
});
