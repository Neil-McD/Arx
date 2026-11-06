// Patterns that must never come back, one rule per row: where to look, what is
// forbidden there, and why. This is the place for "must not contain" rules;
// what code does is proved by tests that run it, never by checking that a
// file contains a particular line.
//
// Usage: node scripts/forbidden_patterns_guard.mjs

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const tsFiles = (dir) => readdirSync(join(ROOT, dir)).filter((file) => /\.ts$/.test(file) && !/\.test\.ts$/.test(file)).map((file) => `${dir}/${file}`);

const RULES = [
  {
    why: "Model calls go through the funded inference gateway or these provider transports, so every call is metered and paid for.",
    files: tsFiles("convex"),
    allow: ["convex/httpRuntimeSupport.ts", "convex/openAiWebSearchTransport.ts", "convex/httpVoice.ts", "convex/openAiNativeToolCompletion.ts"],
    forbidden: /api\.openai\.com/,
  },
  {
    why: "Files are uploaded to storage and referenced by id; a post never stores a file inline as a data URL.",
    files: ["convex/communityInteractions.ts"],
    forbidden: /data_url:\s*v\./,
  },
];

const failures = [];
for (const rule of RULES) {
  for (const file of rule.files) {
    if (rule.allow?.includes(file)) continue;
    const text = readFileSync(join(ROOT, file), "utf8");
    if (rule.forbidden.test(text)) failures.push(`${file}: ${rule.forbidden} (${rule.why})`);
  }
}
if (failures.length) {
  console.error(`forbidden_patterns_guard: ${failures.length} forbidden pattern(s):\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`forbidden_patterns_guard: ok (${RULES.length} rules)`);
