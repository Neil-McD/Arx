import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  // Keep one source of truth for local env: repo root `.env`
  envDir: resolve(process.cwd(), "../.."),
  server: {
    port: 5174,
    fs: {
      // Allow importing the shared desktop CSS from repo root.
      allow: [resolve(process.cwd(), "../..")]
    }
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
          if (id.includes("@supabase")) {
            return "supabase-vendor";
          }
          return "vendor";
        }
      }
    }
  }
});
