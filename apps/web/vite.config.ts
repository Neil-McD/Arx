import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pdfAssetsPlugin } from "./pdfAssetsPlugin";
import { publicPagesPlugin } from "./publicPages";

const webRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(webRoot, "../..");

function deriveAppBuildId(env: Record<string, string>, mode: string): string {
  const releaseGateBuildId = String(
    process.env.POLYNET_RELEASE_GATE_BUILD_ID ?? "",
  ).trim();
  if (releaseGateBuildId) return releaseGateBuildId;
  const explicit = String(env.VITE_POLYNET_BUILD_ID ?? "").trim();
  if (explicit) return explicit;
  const commit = String(
    env.VERCEL_GIT_COMMIT_SHA ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      env.GIT_COMMIT_SHA ??
      process.env.GIT_COMMIT_SHA ??
      "",
  ).trim();
  if (commit) return commit;
  return `${mode}-${Date.now().toString(36)}`;
}

function polynetBuildVersionPlugin(params: {
  buildId: string;
  sentryRelease: string | null;
  environment: string | null;
  design: "v1";
}): Plugin {
  return {
    name: "polynet-build-version",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: `${JSON.stringify(params, null, 2)}\n`,
      });
    },
  };
}

// `docs/product/generated/index.json` carries duplicated search `chunks` and
// `search_text` (~340 KiB) for CLI/LLM ingestion. The in-app reader only renders
// page metadata + `content`, so strip unused offline-search fields when bundling
// for the browser while leaving the generated JSON on disk untouched.
function slimProductDocsPlugin(root: string): Plugin {
  const targetPath = resolve(root, "docs/product/generated/index.json").replace(/\\/g, "/");
  return {
    name: "polynet-slim-product-docs",
    enforce: "pre",
    load(id) {
      const normalized = id.split("?")[0]?.replace(/\\/g, "/");
      if (normalized !== targetPath) return null;
      const parsed = JSON.parse(readFileSync(targetPath, "utf8")) as {
        version: number;
        default_slug: string;
        docs: Array<Record<string, unknown>>;
      };
      const slim = {
        version: parsed.version,
        default_slug: parsed.default_slug,
        docs: (parsed.docs ?? []).map((doc) => ({
          id: doc.id,
          slug: doc.slug,
          title: doc.title,
          section: doc.section,
          summary: doc.summary,
          audience: doc.audience,
          content: doc.content,
        })),
      };
      return JSON.stringify(slim);
    },
  };
}

function deriveRuntimeProxyTarget(env: Record<string, string>): string | undefined {
  const explicit = String(env.VITE_CONVEX_SITE_URL ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const cloudUrl = String(env.VITE_CONVEX_URL ?? "").trim();
  if (!cloudUrl) return undefined;
  try {
    const parsed = new URL(cloudUrl);
    if (parsed.hostname.endsWith(".convex.cloud")) {
      parsed.hostname = parsed.hostname.replace(/\.convex\.cloud$/, ".convex.site");
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  for (const [key, value] of Object.entries(env)) {
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
  const runtimeProxyTarget = deriveRuntimeProxyTarget(env);
  const sentryOrg = String(env.SENTRY_ORG ?? process.env.SENTRY_ORG ?? "").trim();
  const sentryProject = String(env.SENTRY_PROJECT ?? process.env.SENTRY_PROJECT ?? "").trim();
  const sentryAuthToken = String(env.SENTRY_AUTH_TOKEN ?? process.env.SENTRY_AUTH_TOKEN ?? "").trim();
  const sentryRelease = String(
    env.VITE_SENTRY_RELEASE ??
      process.env.SENTRY_RELEASE ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.GIT_COMMIT_SHA ??
      "",
  ).trim();
  const sentryEnvironment = String(
    env.VITE_SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? mode,
  ).trim();
  const appBuildId = deriveAppBuildId(env, mode);
  const isReleaseGateBuild = Boolean(
    String(process.env.POLYNET_RELEASE_GATE_BUILD_ID ?? "").trim(),
  );
  const sentryBuildEnabled = Boolean(
    !isReleaseGateBuild && sentryOrg && sentryProject && sentryAuthToken,
  );

  return {
    plugins: [
      slimProductDocsPlugin(repoRoot),
      react(),
      pdfAssetsPlugin(),
      publicPagesPlugin(repoRoot),
      polynetBuildVersionPlugin({
        buildId: appBuildId,
        sentryRelease: sentryRelease || null,
        environment: sentryEnvironment || null,
        design: "v1",
      }),
      ...(sentryBuildEnabled
        ? [
            ...sentryVitePlugin({
              org: sentryOrg,
              project: sentryProject,
              authToken: sentryAuthToken,
              telemetry: false,
              release: {
                name: sentryRelease || undefined,
              },
              sourcemaps: {
                assets: "./dist/**",
              },
            }),
          ]
        : []),
    ],
    define: {
      __SENTRY_RELEASE__: JSON.stringify(sentryRelease || null),
      __SENTRY_ENVIRONMENT__: JSON.stringify(sentryEnvironment || null),
      __POLYNET_BUILD_ID__: JSON.stringify(appBuildId),
    },
    resolve: {
      dedupe: ["react", "react-dom", "convex"],
      alias: {
        react: resolve(webRoot, "node_modules/react"),
        "react-dom": resolve(webRoot, "node_modules/react-dom"),
        convex: resolve(webRoot, "node_modules/convex"),
        "highlight.js": resolve(webRoot, "node_modules/highlight.js"),
        "lucide-react": resolve(webRoot, "node_modules/lucide-react"),
      },
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "convex/browser",
        "highlight.js/lib/core",
      ],
    },
    // Keep one source of truth for local env: repo root `.env`
    envDir: repoRoot,
    server: {
      port: 5174,
      fs: {
        // Allow importing shared repo modules from the repo root.
        allow: [repoRoot]
      },
      ...(runtimeProxyTarget
        ? {
            proxy: {
              "/runtime": {
                target: runtimeProxyTarget,
                changeOrigin: true,
                secure: true,
              },
            },
          }
        : null),
    },
    build: {
      sourcemap: sentryBuildEnabled ? "hidden" : false,
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replace(/\\/g, "/");
            if (!normalizedId.includes("/node_modules/")) return undefined;
            if (
              normalizedId.includes("/node_modules/react/") ||
              normalizedId.includes("/node_modules/react-dom/") ||
              normalizedId.includes("/node_modules/scheduler/")
            ) {
              return "react-vendor";
            }
            if (normalizedId.includes("/node_modules/convex/")) {
              return "convex-vendor";
            }
            if (normalizedId.includes("/node_modules/lucide-react/")) {
              return "ui-vendor";
            }
            return undefined;
          }
        }
      }
    }
  };
});
