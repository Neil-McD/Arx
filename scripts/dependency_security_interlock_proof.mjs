import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
  undefined,
  "the retired Blaxel Workspace provider must not remain a direct dependency",
);
assert.equal(
  rootLock.packages?.["node_modules/@daytona/sdk"],
  undefined,
  "the root lock must not retain the retired Daytona SDK",
);
assert.equal(
  rootLock.packages?.["node_modules/@blaxel/core"],
  undefined,
  "the root lock must not retain the retired Blaxel SDK",
);

const exactRootResolutions = {
  nanoid: "3.3.18",
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
  "5.0.12",
  "web must pin the patched brace-expansion release",
);
assert.equal(
  webLock.packages?.["node_modules/brace-expansion"]?.version,
  "5.0.12",
  "web lock must resolve brace-expansion@5.0.12",
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
  "3.4.17",
  "web lock must resolve the patched DOMPurify release",
);

for (const [graph, manifest, lock] of [
  ["root", rootManifest, rootLock],
  ["web", webManifest, webLock],
]) {
  assert.equal(manifest.dependencies?.katex, "0.18.2", `${graph} must pin the patched KaTeX release`);
  assert.equal(manifest.overrides?.katex, "$katex", `${graph} math plugins must share the direct KaTeX version`);
  assert.equal(manifest.overrides?.["source-map-js"], "1.2.2", `${graph} must pin patched source-map-js`);
  for (const [name, version] of [["katex", "0.18.2"], ["source-map-js", "1.2.2"]]) {
    const copies = Object.entries(lock.packages ?? {}).filter(([path]) =>
      path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`),
    );
    assert.ok(copies.length > 0, `${graph} lock must contain ${name}`);
    for (const [path, entry] of copies) {
      assert.equal(entry.version, version, `${graph} ${path} must use the patched version`);
    }
  }
}

console.log(
  "dependency_security_interlock_proof: ok (Daytona and Blaxel removed; patched root/web dependency graphs remain compatible)",
);
