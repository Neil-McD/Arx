import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";

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
  rootManifest.dependencies?.["@daytona/sdk"],
  undefined,
  "the retired Daytona runtime must not remain a direct dependency",
);
assert.equal(
  rootManifest.dependencies?.["@blaxel/core"],
  "^0.2.94",
  "Blaxel direct dependency must remain unchanged pending its separate retirement",
);
assert.equal(
  rootLock.packages?.["node_modules/@daytona/sdk"],
  undefined,
  "the root lock must not retain the retired Daytona SDK",
);
assert.equal(
  rootLock.packages?.["node_modules/@blaxel/core"]?.version,
  "0.2.94",
  "root lock must retain the accepted Blaxel SDK",
);

const exactRootResolutions = {
  "@hono/node-server": "2.0.11",
  "@modelcontextprotocol/sdk": "1.29.0",
  axios: "1.18.1",
  "body-parser": "2.3.0",
  "brace-expansion": "5.0.9",
  "fast-uri": "4.1.2",
  hono: "4.12.34",
  "ip-address": "10.4.0",
  "js-yaml": "5.2.2",
};

for (const [packageName, expectedVersion] of Object.entries(exactRootResolutions)) {
  assert.equal(
    rootManifest.overrides?.[packageName],
    expectedVersion,
    `root override for ${packageName} must stay exact`,
  );
  assert.equal(
    rootLock.packages?.[`node_modules/${packageName}`]?.version,
    expectedVersion,
    `root lock must resolve ${packageName}@${expectedVersion}`,
  );
}

assert.equal(
  webManifest.overrides?.["brace-expansion"],
  "5.0.9",
  "web must pin the patched brace-expansion release",
);
assert.equal(
  webLock.packages?.["node_modules/brace-expansion"]?.version,
  "5.0.9",
  "web lock must resolve brace-expansion@5.0.9",
);
assert.equal(
  rootLock.packages?.["node_modules/postcss"]?.version,
  "8.5.23",
  "root lock must resolve the patched PostCSS release",
);
assert.equal(
  webLock.packages?.["node_modules/postcss"]?.version,
  "8.5.23",
  "web lock must resolve the patched PostCSS release",
);
assert.equal(
  webLock.packages?.["node_modules/dompurify"]?.version,
  "3.4.13",
  "web lock must resolve the patched DOMPurify release",
);

const blaxelModule = await import("@blaxel/core");
assert.ok(
  blaxelModule.SandboxInstance,
  "Blaxel SDK must retain SandboxInstance pending provider retirement",
);
assert.ok(
  blaxelModule.VolumeInstance,
  "Blaxel SDK must retain VolumeInstance pending provider retirement",
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

const requireFromBlaxel = createRequire(
  new URL("../node_modules/@blaxel/core/package.json", import.meta.url),
);
const archiver = requireFromBlaxel("archiver");
assert.equal(
  typeof archiver,
  "function",
  "archiver must preserve the callable CommonJS export consumed by Blaxel",
);

const fixtureDirectory = await mkdtemp(
  join(tmpdir(), "polynet-provider-archive-proof-"),
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
  assert.ok(zip.length > 4, "provider-compatible directory archive must emit bytes");
  assert.equal(zip[0], 0x50, "archive must begin with a ZIP signature");
  assert.equal(zip[1], 0x4b, "archive must begin with a ZIP signature");
} finally {
  await rm(fixtureDirectory, { recursive: true, force: true });
}

console.log(
  "dependency_security_interlock_proof: ok (Daytona removed; patched root/web graph and migration-only Blaxel archive API remain compatible)",
);
