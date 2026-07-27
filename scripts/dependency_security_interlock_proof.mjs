import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { createRequire } from "node:module";

const requireFromBlaxel = createRequire(
  new URL("../node_modules/@blaxel/core/package.json", import.meta.url),
);
const rootManifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const webManifest = JSON.parse(
  await readFile(new URL("../apps/web/package.json", import.meta.url), "utf8"),
);
const rootLock = JSON.parse(
  await readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
);
const webLock = JSON.parse(
  await readFile(new URL("../apps/web/package-lock.json", import.meta.url), "utf8"),
);

assert.equal(
  rootManifest.overrides?.["brace-expansion"],
  "5.0.8",
  "root must pin the patched brace-expansion release",
);
assert.equal(
  webManifest.overrides?.["brace-expansion"],
  "5.0.8",
  "web must pin the patched brace-expansion release",
);
assert.equal(
  rootLock.packages?.["node_modules/brace-expansion"]?.version,
  "5.0.8",
  "root lock must resolve patched brace-expansion",
);
assert.equal(
  webLock.packages?.["node_modules/brace-expansion"]?.version,
  "5.0.8",
  "web lock must resolve patched brace-expansion",
);

const rootPackageEntries = Object.entries(rootLock.packages ?? {});
assert.equal(
  rootPackageEntries.some(
    ([packagePath, entry]) =>
      packagePath.endsWith("node_modules/archiver") &&
      entry?.version === "7.0.1",
  ),
  true,
  "root lock must retain the Blaxel-compatible archiver release",
);

const archiver = requireFromBlaxel("archiver");
assert.equal(
  typeof archiver,
  "function",
  "archiver must preserve the callable CommonJS export consumed by Blaxel",
);

const fixtureDirectory = await mkdtemp(
  join(tmpdir(), "polynet-blaxel-archive-proof-"),
);

try {
  await writeFile(join(fixtureDirectory, "proof.txt"), "ok");
  const output = new PassThrough();
  const chunks = [];

  await new Promise((resolve, reject) => {
    output.on("data", (chunk) => chunks.push(chunk));
    output.on("end", resolve);
    output.on("error", reject);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(fixtureDirectory, false);
    void archive.finalize();
  });

  const zip = Buffer.concat(chunks);
  assert.ok(zip.length > 4, "Blaxel-compatible directory archive must emit bytes");
  assert.equal(zip[0], 0x50, "archive must begin with a ZIP signature");
  assert.equal(zip[1], 0x4b, "archive must begin with a ZIP signature");
} finally {
  await rm(fixtureDirectory, { recursive: true, force: true });
}

console.log(
  "dependency_security_interlock_proof: ok (root/web brace-expansion 5.0.8, Blaxel archive API compatible)",
);
