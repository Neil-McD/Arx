// @vitest-environment node

import { createRequire } from "node:module";
import { expect, test } from "vitest";

// Resolve from PostHog itself so this exercises its transitive dependency,
// not the separate fflate version used by the root application.
const requireFromWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const requireFromPostHog = createRequire(requireFromWeb.resolve("posthog-js"));
const { gzipSync, gunzipSync, strToU8, strFromU8 } = requireFromPostHog("fflate") as typeof import("fflate");

test.each([{}, { event: "test", text: "Member context — 你好 🌍" }, { data: "context".repeat(2000) }])(
  "web analytics compression remains deterministic and lossless: %j",
  (payload) => {
    const json = JSON.stringify(payload);
    const compressed = gzipSync(strToU8(json), { mtime: 0 });
    expect(strFromU8(gunzipSync(compressed))).toBe(json);
    expect(gzipSync(strToU8(json), { mtime: 0 })).toEqual(compressed);
  },
);
