import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(webRoot, "../..");

function deriveAppBuildId(env: Record<string, string>, mode: string): string {
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

function polynetBuildVersionPlugin(buildId: string): Plugin {
  return {
    name: "polynet-build-version",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: `${JSON.stringify({ buildId }, null, 2)}\n`,
      });
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
  const sentryBuildEnabled = Boolean(sentryOrg && sentryProject && sentryAuthToken);

  return {
    plugins: [
      react(),
      polynetBuildVersionPlugin(appBuildId),
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
            if (normalizedId.includes("/node_modules/highlight.js/")) {
              return "highlight-vendor";
            }
            if (normalizedId.includes("/node_modules/lucide-react/")) {
              return "ui-vendor";
            }
            if (
              normalizedId.includes("/node_modules/@sentry/") ||
              normalizedId.includes("/node_modules/@sentry-internal/") ||
              normalizedId.includes("/node_modules/posthog-js/")
            ) {
              return "analytics-vendor";
            }
            if (
              normalizedId.includes("/node_modules/react-markdown/") ||
              normalizedId.includes("/node_modules/remark-") ||
              normalizedId.includes("/node_modules/rehype-") ||
              normalizedId.includes("/node_modules/katex/") ||
              normalizedId.includes("/node_modules/unified/") ||
              normalizedId.includes("/node_modules/@ungap/structured-clone/") ||
              normalizedId.includes("/node_modules/micromark") ||
              normalizedId.includes("/node_modules/mdast-") ||
              normalizedId.includes("/node_modules/hast-") ||
              normalizedId.includes("/node_modules/hast-util-to-jsx-runtime/") ||
              normalizedId.includes("/node_modules/html-url-attributes/") ||
              normalizedId.includes("/node_modules/unist-") ||
              normalizedId.includes("/node_modules/vfile") ||
              normalizedId.includes("/node_modules/longest-streak/") ||
              normalizedId.includes("/node_modules/style-to-js/") ||
              normalizedId.includes("/node_modules/style-to-object/") ||
              normalizedId.includes("/node_modules/inline-style-parser/") ||
              normalizedId.includes("/node_modules/property-information/") ||
              normalizedId.includes("/node_modules/comma-separated-tokens/") ||
              normalizedId.includes("/node_modules/space-separated-tokens/") ||
              normalizedId.includes("/node_modules/decode-named-character-reference/") ||
              normalizedId.includes("/node_modules/character-entities") ||
              normalizedId.includes("/node_modules/trim-lines/")
            ) {
              return "markdown-vendor";
            }
            return undefined;
          }
        }
      }
    }
  };
});
