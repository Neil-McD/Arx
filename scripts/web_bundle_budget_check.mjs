import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const appDir = process.argv[2] ?? "apps/web";
const assetsDir = join(appDir, "dist", "assets");

const limits = {
  maxSingleJsBytes: readLimit("WEB_BUNDLE_MAX_SINGLE_JS_BYTES", 1_600_000),
  maxIndexJsBytes: readLimit("WEB_BUNDLE_MAX_INDEX_JS_BYTES", 1_000_000),
  maxTotalJsBytes: readLimit("WEB_BUNDLE_MAX_TOTAL_JS_BYTES", 3_400_000),
  maxBuilderOnlyJsBytes: readLimit("WEB_BUNDLE_MAX_BUILDER_ONLY_JS_BYTES", 750_000),
};

// Chunks only owners and their team load, on demand (the lesson editor). They
// never reach members, so they have their own budget instead of the total's.
const BUILDER_ONLY_CHUNK = /^LessonEditor-/;

function readLimit(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function formatBytes(value) {
  return `${(value / 1024).toFixed(1)} KiB`;
}

function fail(message) {
  console.error(`web_bundle_budget_check: ${message}`);
  process.exitCode = 1;
}

let files;
try {
  files = readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => ({
      name,
      bytes: statSync(join(assetsDir, name)).size,
    }))
    .sort((a, b) => b.bytes - a.bytes);
} catch (error) {
  console.error(
    `web_bundle_budget_check: expected built assets under ${assetsDir}; run npm run build first`,
  );
  throw error;
}

const totalJsBytes = files.filter((file) => !BUILDER_ONLY_CHUNK.test(file.name)).reduce((sum, file) => sum + file.bytes, 0);
const builderOnlyJsBytes = files.filter((file) => BUILDER_ONLY_CHUNK.test(file.name)).reduce((sum, file) => sum + file.bytes, 0);
const largest = files[0] ?? null;
const indexChunk = files.find((file) => file.name.startsWith("index-"));

if (largest && largest.bytes > limits.maxSingleJsBytes) {
  fail(
    `largest JS chunk ${largest.name} is ${formatBytes(largest.bytes)}, limit ${formatBytes(limits.maxSingleJsBytes)}`,
  );
}
if (indexChunk && indexChunk.bytes > limits.maxIndexJsBytes) {
  fail(
    `app shell chunk ${indexChunk.name} is ${formatBytes(indexChunk.bytes)}, limit ${formatBytes(limits.maxIndexJsBytes)}`,
  );
}
if (totalJsBytes > limits.maxTotalJsBytes) {
  fail(
    `total JS is ${formatBytes(totalJsBytes)}, limit ${formatBytes(limits.maxTotalJsBytes)}`,
  );
}

if (builderOnlyJsBytes > limits.maxBuilderOnlyJsBytes) {
  fail(
    `builder-only JS is ${formatBytes(builderOnlyJsBytes)}, limit ${formatBytes(limits.maxBuilderOnlyJsBytes)}`,
  );
}

if (process.exitCode) {
  console.error("Largest JS chunks:");
  for (const file of files.slice(0, 8)) {
    console.error(`- ${file.name}: ${formatBytes(file.bytes)}`);
  }
} else {
  console.log(
    `web_bundle_budget_check: ok (${files.length} JS chunks, total ${formatBytes(totalJsBytes)}, builder-only ${formatBytes(builderOnlyJsBytes)})`,
  );
}
