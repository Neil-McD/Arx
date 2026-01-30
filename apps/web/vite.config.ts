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
  }
});
