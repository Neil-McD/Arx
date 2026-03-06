import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

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
  const env = loadEnv(mode, __dirname, "");
  const runtimeProxyTarget = deriveRuntimeProxyTarget(env);

  return {
    plugins: [react()],
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        react: resolve(__dirname, "node_modules/react"),
        "react-dom": resolve(__dirname, "node_modules/react-dom")
      }
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"]
    },
    clearScreen: false,
    server: {
      port: 5173,
      strictPort: true,
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
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("react") || id.includes("react-dom") || id.includes("scheduler")) {
              return "react-vendor";
            }
            if (id.includes("highlight.js")) {
              return "highlight-vendor";
            }
            return "vendor";
          }
        }
      }
    }
  };
});
