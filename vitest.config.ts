import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    fileParallelism: false,
    include: ["convex/**/*.test.ts"],
  },
});
