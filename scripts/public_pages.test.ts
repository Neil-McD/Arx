// Polynet's public pages (/ai, /privacy, /terms) are whole HTML files that
// read without JavaScript, and every host routes each address to its file.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  OPERATOR_NAME,
  PUBLIC_PAGES,
  SUPPORT_EMAIL,
  publicPageForPath,
  renderPublicPage,
} from "../apps/web/publicPages";
import { PRIVACY_AI_DATA_POLICY_DOCUMENT, TERMS_OF_SERVICE_DOCUMENT } from "../shared/legalDocuments";

const repoRoot = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const page = (path: string) => {
  const found = PUBLIC_PAGES.find((entry) => entry.path === path)!;
  return renderPublicPage(found, read(found.sourcePath));
};

describe("public pages", () => {
  it("are complete pages with no app script", () => {
    for (const entry of PUBLIC_PAGES) {
      const html = renderPublicPage(entry, read(entry.sourcePath));
      expect(html).toMatch(/^<!doctype html>/);
      expect(html).not.toMatch(/<script/i);
      expect(html).toContain(`<link rel="canonical" href="https://www.polynet.ai${entry.path}">`);
      expect(html).toContain(`mailto:${SUPPORT_EMAIL}`);
      expect(html).toContain(`Polynet is operated by ${OPERATOR_NAME}.`);
      expect(html).not.toMatch(/^---$/m);
    }
  });

  it("show the current legal documents", () => {
    expect(PUBLIC_PAGES.find((entry) => entry.path === "/privacy")!.sourcePath).toBe(PRIVACY_AI_DATA_POLICY_DOCUMENT.sourcePath);
    expect(PUBLIC_PAGES.find((entry) => entry.path === "/terms")!.sourcePath).toBe(TERMS_OF_SERVICE_DOCUMENT.sourcePath);
    expect(page("/privacy")).toContain("<h1>Polynet Privacy &amp; AI Data Policy");
    expect(page("/terms")).toContain("<h1>Polynet Terms of Service");
  });

  it("the AI page gives the address, setup, the yes list and how to disconnect", () => {
    const html = page("/ai");
    expect(html).toContain("https://www.polynet.ai/runtime/mcp");
    expect(html).toContain("claude mcp add --transport http polynet https://www.polynet.ai/runtime/mcp");
    expect(html).toContain("codex mcp add polynet --url https://www.polynet.ai/runtime/mcp");
    for (const heading of ["Connect it", "What it can see", "What it can do", "What waits for your yes", "Disconnect", "Privacy and help"]) {
      expect(html).toContain(`<h2>${heading}</h2>`);
    }
    expect(html).toContain('href="/privacy"');
  });

  it("the dev server finds a page by its address, phone twin and trailing slash", () => {
    expect(publicPageForPath("/privacy")?.fileName).toBe("privacy.html");
    expect(publicPageForPath("/privacy/")?.fileName).toBe("privacy.html");
    expect(publicPageForPath("/m/terms")?.fileName).toBe("terms.html");
    expect(publicPageForPath("/ai?from=claude")?.fileName).toBe("ai.html");
    expect(publicPageForPath("/aim")).toBeNull();
    expect(publicPageForPath("/")).toBeNull();
  });

  it("both Vercel configs route each address to its file before the app", () => {
    for (const config of ["vercel.json", "apps/web/vercel.json"]) {
      const routes = JSON.parse(read(config)).routes as Array<Record<string, string>>;
      const index = routes.findIndex((route) => route.dest === "/$1.html");
      expect(index, config).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(routes.findIndex((route) => route.handle === "filesystem"));
      const pattern = new RegExp(`^${routes[index]!.src}$`);
      for (const entry of PUBLIC_PAGES) {
        for (const address of [entry.path, `${entry.path}/`, `/m${entry.path}`]) {
          const match = address.match(pattern);
          expect(match?.[1], address).toBe(entry.fileName.replace(/\.html$/, ""));
        }
      }
      expect(pattern.test("/aim")).toBe(false);
    }
  });

  it("security.txt names the support address and private GitHub reporting", () => {
    expect(existsSync(resolve(repoRoot, "apps/web/public/.well-known/security.txt"))).toBe(true);
    const text = read("apps/web/public/.well-known/security.txt");
    expect(text).toContain(`Contact: mailto:${SUPPORT_EMAIL}`);
    expect(text).toContain("security/advisories/new");
  });
});
