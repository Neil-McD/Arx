import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(webRoot, "../..");

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
  const sentryBuildEnabled = Boolean(sentryOrg && sentryProject && sentryAuthToken);

  return {
    plugins: [
      react(),
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
            return "vendor";
          }
        }
      }
    }
  };
});
