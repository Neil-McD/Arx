// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { isPdfDocument, pdfLinksInText, safeDocumentUrl } from "../shared/messagePdf";
import { loadYouTubeMetadata } from "../shared/youtubeMetadata";

afterEach(() => vi.unstubAllGlobals());
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
describe("YouTube metadata", () => {
  it("coalesces duplicate requests and retains text only, with no credentials", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ title: "Example", author_name: "Builder", html: "<script>bad()</script>" })));
    vi.stubGlobal("fetch", fetcher);
    expect(await Promise.all([loadYouTubeMetadata("metadata001"), loadYouTubeMetadata("metadata001")])).toEqual([{ title: "Example", author: "Builder" }, { title: "Example", author: "Builder" }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer" });
  });
  it("fails to a playable fallback on unavailable metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await loadYouTubeMetadata("metadata002")).toBeNull();
  });
});
