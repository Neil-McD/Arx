import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

type JsonRecord = Record<string, any>;

const EXPECTED_MANIFESTS = [
  "apps/preview-proxy/package.json",
  "apps/web/package.json",
  "package.json",
];
const EXPECTED_LOCKFILES = [
  "apps/preview-proxy/package-lock.json",
  "apps/web/package-lock.json",
  "package-lock.json",
];

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function readJson(path: string): JsonRecord {
  return JSON.parse(read(path)) as JsonRecord;
}

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function declaredPackages(manifest: JsonRecord): Record<string, string> {
  return {
    ...(manifest.dependencies ?? {}),
    ...(manifest.devDependencies ?? {}),
  };
}

const tracked = trackedFiles();
const manifests = tracked
  .filter((path) => /(^|\/)package\.json$/.test(path))
  .sort();
const lockfiles = tracked
  .filter((path) => /(^|\/)package-lock\.json$/.test(path))
  .sort();

assert.deepEqual(
  manifests,
  EXPECTED_MANIFESTS,
  "package manifests must map one-to-one to the three documented installed artifacts",
);
assert.deepEqual(
  lockfiles,
  EXPECTED_LOCKFILES,
  "package lockfiles must map one-to-one to the three documented installed artifacts",
);

const graphPaths = [
  ["package.json", "package-lock.json"],
  ["apps/web/package.json", "apps/web/package-lock.json"],
  ["apps/preview-proxy/package.json", "apps/preview-proxy/package-lock.json"],
] as const;

for (const [manifestPath, lockPath] of graphPaths) {
  const manifest = readJson(manifestPath);
  const lock = readJson(lockPath);
  const lockRoot = lock.packages?.[""] as JsonRecord | undefined;

  assert.equal(manifest.engines?.node, "22.x", `${manifestPath} must declare Node 22.x`);
  assert.equal(lock.lockfileVersion, 3, `${lockPath} must use lockfile version 3`);
  assert(lockRoot, `${lockPath} must contain a root package record`);
  assert.equal(lockRoot.engines?.node, "22.x", `${lockPath} root must declare Node 22.x`);
  assert.equal(lockRoot.name, manifest.name, `${lockPath} root name must match ${manifestPath}`);
  assert.equal(
    lockRoot.version ?? null,
    manifest.version ?? null,
    `${lockPath} root version must match ${manifestPath}`,
  );
  assert.deepEqual(
    lockRoot.dependencies ?? {},
    manifest.dependencies ?? {},
    `${lockPath} root dependencies must match ${manifestPath}`,
  );
  assert.deepEqual(
    lockRoot.devDependencies ?? {},
    manifest.devDependencies ?? {},
    `${lockPath} root devDependencies must match ${manifestPath}`,
  );
  assert.equal(
    Object.hasOwn(manifest, "workspaces"),
    false,
    `${manifestPath} must not declare npm workspaces without a deployment redesign`,
  );
  for (const [name, range] of Object.entries(declaredPackages(manifest))) {
    assert.equal(
      String(range).startsWith("workspace:"),
      false,
      `${manifestPath} dependency ${name} must not couple deployment roots with workspace:`,
    );
  }
}

const rootPackage = readJson("package.json");
const webPackage = readJson("apps/web/package.json");
const proxyPackage = readJson("apps/preview-proxy/package.json");
const rootDeclared = declaredPackages(rootPackage);
const webDeclared = declaredPackages(webPackage);
const proxyDeclared = declaredPackages(proxyPackage);
const sharedRootWebPackages = Object.keys(rootDeclared)
  .filter((name) => Object.hasOwn(webDeclared, name))
  .sort();

assert(
  sharedRootWebPackages.length > 0,
  "root and web should retain declared range parity for their shared source/toolchain packages",
);
for (const name of sharedRootWebPackages) {
  assert.equal(
    rootDeclared[name],
    webDeclared[name],
    `root/web shared package ${name} must use one declared version range`,
  );
}

const rootVercel = readJson("vercel.json");
assert.equal(
  rootVercel.installCommand,
  "npm ci && npm --prefix apps/web ci",
  "root Vercel must install root API/runtime and web graphs independently",
);
assert.equal(rootVercel.buildCommand, "npm run build", "root Vercel must use the root build delegate");
assert.equal(rootVercel.outputDirectory, "apps/web/dist", "root Vercel must publish the web artifact");
assert(
  Object.keys(rootVercel.functions ?? {}).some((path) => path.startsWith("api/")),
  "root Vercel must retain API function ownership",
);

assert.equal(rootPackage.scripts?.build, "npm --prefix apps/web run build");
assert.equal(rootPackage.scripts?.["check:web-typecheck"], "npm --prefix apps/web run typecheck");
assert.equal(
  rootPackage.scripts?.["check:web-bundle-budget"],
  "npm --prefix apps/web run check:bundle-budget",
);
assert.equal(
  rootPackage.scripts?.["check:package-deployment-boundary-contract"],
  "node --experimental-strip-types --experimental-specifier-resolution=node scripts/package_deployment_boundary_contract_proof.ts",
);
assert.equal(webPackage.scripts?.build, "vite build");
assert.equal(webPackage.scripts?.typecheck, "tsc --noEmit");
assert.equal(webPackage.scripts?.["check:bundle-budget"], "node ../../scripts/web_bundle_budget_check.mjs .");
assert.equal(proxyPackage.scripts?.check?.includes("node --check server.js"), true);

const nestedWebVercel = readJson("apps/web/vercel.json");
for (const field of ["installCommand", "buildCommand", "outputDirectory"]) {
  assert.equal(
    Object.hasOwn(nestedWebVercel, field),
    false,
    `apps/web/vercel.json must remain route-only and must not create another build owner via ${field}`,
  );
}

const proxyDockerfile = read("apps/preview-proxy/Dockerfile");
const proxyFly = read("apps/preview-proxy/fly.toml");
assert.match(proxyDockerfile, /^FROM node:22-alpine$/m);
assert.match(proxyDockerfile, /^COPY package\*\.json \.\/$/m);
assert.match(proxyDockerfile, /^RUN npm ci --omit=dev$/m);
assert.match(proxyFly, /^app = "polynet-preview-proxy"$/m);
assert.match(proxyFly, /^\s*internal_port = 8080$/m);

const ci = read(".github/workflows/mvp-guards.yml");
assert.match(ci, /node-version: 22/);
for (const command of [
  "npm ci",
  "npm audit --audit-level=low",
  "npm --prefix apps/web ci",
  "npm --prefix apps/web audit --audit-level=low",
  "npm --prefix apps/preview-proxy ci",
  "npm --prefix apps/preview-proxy audit --audit-level=low",
  "npm run check:package-deployment-boundary-contract",
]) {
  assert(
    ci.includes(`run: ${command}`),
    `canonical CI must own package boundary command: ${command}`,
  );
}

const sharedWithProxy = Object.keys(proxyDeclared).filter(
  (name) => Object.hasOwn(rootDeclared, name) || Object.hasOwn(webDeclared, name),
);

console.log(
  `package_deployment_boundary_contract_proof: ok (${graphPaths.length} graphs, ` +
    `${sharedRootWebPackages.length} root/web shared declarations, ` +
    `${sharedWithProxy.length} current proxy overlaps)`,
);
