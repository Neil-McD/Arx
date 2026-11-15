import { afterEach, describe, expect, it, vi } from "vitest";
import { executeWebResearch } from "./webResearchTools";

function exaReplies(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("web_research on Exa", () => {
  it("is unavailable without a key, and calls nobody", async () => {
    vi.stubEnv("EXA_API_KEY", "");
    const fetchMock = exaReplies({});
    const result = await executeWebResearch({ action: "search", query: "surf forecast" });
    expect(result).toMatchObject({ ok: false, code: "web_research_unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("searches with highlights and charges Exa's reported cost", async () => {
    vi.stubEnv("EXA_API_KEY", "test-key");
    const fetchMock = exaReplies({
      results: [
        { title: "Swell guide", url: "https://example.com/swell", publishedDate: "2026-10-01T00:00:00Z", highlights: ["Long-period swell"] },
        { title: "Local", url: "http://127.0.0.1/admin", highlights: ["no"] },
      ],
      costDollars: { total: 0.011 },
    });
    const result = await executeWebResearch({ action: "search", query: "swell period" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.exa.ai/search");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
    expect(JSON.parse(String(init.body))).toMatchObject({ query: "swell period", contents: { highlights: true } });
    expect(result.outputText).toContain("Long-period swell");
    // A local address in the results is dropped.
    expect(result.webSources?.map((source) => source.url)).toEqual(["https://example.com/swell"]);
    expect(result.billingEvidence).toEqual({ rawVendorCostUsd: 0.011, costSource: "provider_exact", provider: "exa", backends: ["exa"] });
  });

  it("refuses a local URL before anything leaves Polynet", async () => {
    vi.stubEnv("EXA_API_KEY", "test-key");
    const fetchMock = exaReplies({});
    const result = await executeWebResearch({ action: "open_page", url: "http://localhost:3000" });
    expect(result).toMatchObject({ ok: false, code: "web_research_local_url_not_supported" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads one page and finds text in it", async () => {
    vi.stubEnv("EXA_API_KEY", "test-key");
    exaReplies({
      results: [{ title: "Tides", url: "https://example.com/tides", text: "High tide at 6am. Low tide at noon." }],
      statuses: [{ id: "https://example.com/tides", status: "success" }],
      costDollars: { total: 0.001 },
    });
    const result = await executeWebResearch({ action: "find_in_page", url: "https://example.com/tides", query: "low tide" });
    expect(result.ok && result.outputText).toContain("Matches: 1");
  });

  it("says when a page couldn't be read", async () => {
    vi.stubEnv("EXA_API_KEY", "test-key");
    exaReplies({ results: [], statuses: [{ id: "https://example.com/x", status: "error", error: { tag: "CRAWL_NOT_FOUND" } }] });
    const result = await executeWebResearch({ action: "open_page", url: "https://example.com/x" });
    expect(result).toMatchObject({ ok: false, code: "web_research_page_unavailable" });
  });
});
