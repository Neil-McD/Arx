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
  "^0.192.0",
  "Daytona direct dependency must remain on the accepted runtime version",
);
assert.equal(
  rootManifest.dependencies?.["@blaxel/core"],
  "^0.2.94",
  "Blaxel direct dependency must remain unchanged pending its separate retirement",
);
assert.equal(
  rootLock.packages?.["node_modules/@daytona/sdk"]?.version,
  "0.192.0",
  "root lock must retain the accepted Daytona SDK",
);
assert.equal(
  rootLock.packages?.["node_modules/@blaxel/core"]?.version,
  "0.2.94",
  "root lock must retain the accepted Blaxel SDK",
);

const exactRootResolutions = {
  "@hono/node-server": "2.0.11",
  "@modelcontextprotocol/sdk": "1.29.0",
  "@opentelemetry/configuration": "0.221.0",
  "@opentelemetry/core": "2.10.0",
  "@opentelemetry/exporter-logs-otlp-grpc": "0.221.0",
  "@opentelemetry/exporter-logs-otlp-http": "0.221.0",
  "@opentelemetry/exporter-logs-otlp-proto": "0.221.0",
  "@opentelemetry/exporter-metrics-otlp-grpc": "0.221.0",
  "@opentelemetry/exporter-metrics-otlp-http": "0.221.0",
  "@opentelemetry/exporter-metrics-otlp-proto": "0.221.0",
  "@opentelemetry/exporter-prometheus": "0.221.0",
  "@opentelemetry/exporter-trace-otlp-grpc": "0.221.0",
  "@opentelemetry/exporter-trace-otlp-http": "0.221.0",
  "@opentelemetry/exporter-trace-otlp-proto": "0.221.0",
  "@opentelemetry/exporter-zipkin": "2.10.0",
  "@opentelemetry/instrumentation-http": "0.221.0",
  "@opentelemetry/otlp-exporter-base": "0.221.0",
  "@opentelemetry/otlp-grpc-exporter-base": "0.221.0",
  "@opentelemetry/otlp-transformer": "0.221.0",
  "@opentelemetry/propagator-b3": "2.10.0",
  "@opentelemetry/propagator-jaeger": "2.10.0",
  "@opentelemetry/resources": "2.10.0",
  "@opentelemetry/sdk-logs": "0.221.0",
  "@opentelemetry/sdk-metrics": "2.10.0",
  "@opentelemetry/sdk-node": "0.221.0",
  "@opentelemetry/sdk-trace-base": "2.10.0",
  "@opentelemetry/sdk-trace-node": "2.10.0",
  axios: "1.18.1",
  "body-parser": "2.3.0",
  "brace-expansion": "5.0.8",
  "fast-uri": "4.1.1",
  "js-yaml": "5.2.2",
  protobufjs: "8.7.1",
  "shell-quote": "1.10.0",
  tar: "7.5.21",
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
  "5.0.8",
  "web must pin the patched brace-expansion release",
);
assert.equal(
  webLock.packages?.["node_modules/brace-expansion"]?.version,
  "5.0.8",
  "web lock must resolve brace-expansion@5.0.8",
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
  "3.4.12",
  "web lock must resolve the patched DOMPurify release",
);

const [daytonaModule, blaxelModule] = await Promise.all([
  import("@daytona/sdk"),
  import("@blaxel/core"),
]);
assert.equal(
  typeof daytonaModule.Daytona,
  "function",
  "Daytona SDK must retain its runtime client export",
);
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
  "dependency_security_interlock_proof: ok (provider SDKs unchanged, patched root/web graph, Blaxel archive API compatible)",
);
