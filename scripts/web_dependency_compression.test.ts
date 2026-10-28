// @vitest-environment node

import { createRequire } from "node:module";
import { expect, test } from "vitest";

// Resolve from PostHog itself so this exercises its transitive dependency.
const requireFromWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const requireFromPostHog = createRequire(requireFromWeb.resolve("posthog-js"));
type Fflate = {
  gzipSync(data: Uint8Array, opts?: { mtime?: number }): Uint8Array;
  gunzipSync(data: Uint8Array): Uint8Array;
  strToU8(text: string): Uint8Array;
  strFromU8(data: Uint8Array): string;
};
const { gzipSync, gunzipSync, strToU8, strFromU8 } = requireFromPostHog("fflate") as Fflate;

test.each([{}, { event: "test", text: "Member context — 你好 🌍" }, { data: "context".repeat(2000) }])(
  "web analytics compression remains deterministic and lossless: %j",
  (payload) => {
    const json = JSON.stringify(payload);
    const compressed = gzipSync(strToU8(json), { mtime: 0 });
    expect(strFromU8(gunzipSync(compressed))).toBe(json);
    expect(gzipSync(strToU8(json), { mtime: 0 })).toEqual(compressed);
  },
);
