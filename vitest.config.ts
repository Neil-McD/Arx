import { defineConfig } from "vitest/config";

export default defineConfig({
  // Bundled browser scripts the community edge serves as text (wrangler's "Text" rule).
  plugins: [{
    name: "edge-text-bundles",
    enforce: "pre",
    transform(code: string, id: string) {
      return id.endsWith(".bundle.js") ? { code: `export default ${JSON.stringify(code)};`, map: null } : null;
    },
  }],
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts", "scripts/**/*.test.ts", "infra/**/src/**/*.test.ts", "apps/web/src/**/*.test.ts"],
    server: { deps: { inline: [/\.bundle\.js$/] } },
  },
});
