import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  handleAuthCallback,
  handleAuthStart,
  handleSessionBootstrap,
  handleSessionLogout,
  handleSessionRefresh,
} from "./api/_lib/bridge.js";

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

function authSessionBridgeDevPlugin() {
  const routeHandlers = new Map<string, (req: any, res: any) => Promise<void>>([
    ["/api/auth/start", handleAuthStart],
    ["/api/auth/callback", handleAuthCallback],
    ["/api/session/bootstrap", handleSessionBootstrap],
    ["/api/session/refresh", handleSessionRefresh],
    ["/api/session/logout", handleSessionLogout],
  ]);

  return {
    name: "auth-session-bridge-dev",
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: (err?: unknown) => void) => {
        const pathname = (() => {
          try {
            return new URL(req.url ?? "/", "http://localhost").pathname;
          } catch {
            return "";
          }
        })();
        const handler = routeHandlers.get(pathname);
        if (!handler) {
          next();
          return;
        }
        try {
          await handler(req, res);
          if (!res.writableEnded) next();
        } catch (error) {
          server.ssrFixStacktrace?.(error);
          const message = error instanceof Error ? error.message : String(error ?? "unknown_bridge_error");
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ ok: false, error: message }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  for (const [key, value] of Object.entries(env)) {
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
  const runtimeProxyTarget = deriveRuntimeProxyTarget(env);

  return {
    plugins: [react(), authSessionBridgeDevPlugin()],
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        react: resolve(repoRoot, "node_modules/react"),
        "react-dom": resolve(repoRoot, "node_modules/react-dom"),
      },
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
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
