import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePublicEntryRoute } from "../shared/publicEntryRoute";

const ROOT = resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), "utf8");

describe("Wave 3C: instant public links and lightweight visitor entry", () => {
  it("routes clean public URLs into the lightweight visitor shell", () => {
    expect(resolvePublicEntryRoute({ pathname: "/" })).toEqual({ kind: "landing" });
    expect(resolvePublicEntryRoute({ pathname: "/", search: "?utm_source=youtube&ref=founder" })).toEqual({
      kind: "landing",
    });
    expect(resolvePublicEntryRoute({ pathname: "/discover" })).toEqual({ kind: "discover" });
    expect(resolvePublicEntryRoute({ pathname: "/discover/" })).toEqual({ kind: "discover" });
    expect(resolvePublicEntryRoute({ pathname: "/c/builders" })).toEqual({
      kind: "community_landing",
      slug: "builders",
    });
    expect(
      resolvePublicEntryRoute({
        pathname: "/c/builders/",
        search: "?utm_campaign=launch",
      }),
    ).toEqual({
      kind: "community_landing",
      slug: "builders",
    });
  });

  it("falls through to the full Studio app for authenticated, callback, checkout, or deep routes", () => {
    expect(resolvePublicEntryRoute({ pathname: "/", hasRecentAuthFlowPending: true })).toBeNull();
    expect(resolvePublicEntryRoute({ pathname: "/", search: "?launch=app" })).toBeNull();
    expect(resolvePublicEntryRoute({ pathname: "/", search: "?code=abc&state=xyz" })).toBeNull();
    expect(resolvePublicEntryRoute({ pathname: "/", search: "?billing=success" })).toBeNull();
    expect(resolvePublicEntryRoute({ pathname: "/c/builders", search: "?checkout=chk_123" })).toBeNull();
    expect(resolvePublicEntryRoute({ pathname: "/c/builders", search: "?intent=join" })).toBeNull();
    expect(resolvePublicEntryRoute({ pathname: "/c/builders/home" })).toBeNull();
    expect(resolvePublicEntryRoute({ pathname: "/c/builders/chat" })).toBeNull();
    expect(resolvePublicEntryRoute({ pathname: "/c/builders/preview" })).toBeNull();
    expect(resolvePublicEntryRoute({ pathname: "/c/preview" })).toBeNull();
    expect(resolvePublicEntryRoute({ pathname: "/c/100%" })).toBeNull();
    expect(resolvePublicEntryRoute({ pathname: "/c/%E0%A4%A" })).toBeNull();
    expect(resolvePublicEntryRoute({ pathname: "/settings" })).toBeNull();
    expect(resolvePublicEntryRoute({ pathname: "/docs" })).toBeNull();
    expect(resolvePublicEntryRoute({ pathname: "/m/" })).toBeNull();
  });

  it("keeps the full Studio app and Studio stylesheet off the root public entry", () => {
    const main = read("apps/web/src/main.tsx");
    const app = read("apps/web/src/App.tsx");
    const publicShell = read("apps/web/src/components/WebPublicVisitorShell.tsx");
    const legalModal = read("apps/web/src/components/WebPlatformLegalReaderModal.tsx");

    expect(main).not.toMatch(/^import\s+App\s+from\s+["']\.\/App["']/m);
    expect(main).toMatch(/React\.lazy\(\(\) => import\("\.\/App"\)\)/);
    expect(main).not.toMatch(/^import\s+["']\.\/index\.css["']/m);
    expect(main).toMatch(/^import\s+["']\.\/base\.css["']/m);
    expect(main).not.toContain("bootConvexProbe");
    expect(app).toMatch(/^import\s+["']\.\/index\.css["']/m);
    expect(app).toContain("bootConvexProbe");
    expect(publicShell).toContain("bootstrapSessionDetailed");
    expect(publicShell).toContain("WebCommunityLandingPage");
    expect(legalModal).toMatch(/^import\s+["']\.\/WebPlatformLegalReaderModal\.css["']/m);
  });
});
